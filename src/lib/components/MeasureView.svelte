<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Square from '@lucide/svelte/icons/square';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Save from '@lucide/svelte/icons/save';
  import { app } from '../state.svelte';
  import { router } from '../router.svelte';
  import { newId, saveReport } from '../reports';
  import Segmented from './Segmented.svelte';
  import PhotometryPanel from './PhotometryPanel.svelte';
  import FlickerPanel from './FlickerPanel.svelte';
  import Modal from './Modal.svelte';
  import { onDestroy } from 'svelte';

  let { tab }: { tab: 'photometry' | 'flicker' } = $props();

  // The route is the source of truth. Picking a tab shows it at once (a writable
  // derived, overridden here) and navigates; the route then catches up.
  let current = $derived(tab);
  function selectTab(next: 'photometry' | 'flicker') {
    if (next === current) return;
    current = next;
    router.go(next === 'flicker' ? 'flicker' : '');
  }
  // As the app: measuring stops when the tab changes or the screen goes away.
  $effect(() => {
    if (tab !== 'photometry') app.stopLive();
  });
  onDestroy(() => app.stopLive());

  let nameOpen = $state(false);
  let reportName = $state('');
  let pendingFlicker = $state.raw<typeof app.flicker>(null);
  let pendingReading = $state.raw<typeof app.reading>(null);
  const MAX_NAME = 20;

  async function startSave() {
    if (!app.reading) return;
    app.stopLive();
    pendingReading = app.reading;
    app.saving = true;
    // The app captures flicker right before saving so the report has both parts.
    const f = await app.measureFlicker();
    app.saving = false;
    if (!f) return;
    pendingFlicker = f;
    reportName = '';
    nameOpen = true;
  }

  async function confirmSave() {
    const title = reportName.trim();
    if (!title || title.length > MAX_NAME || !pendingReading) return;
    const id = newId();
    try {
      await saveReport({ id, title, createdAt: Date.now(), device: app.deviceName, reading: pendingReading, flicker: pendingFlicker });
    } catch (err) {
      app.error = `Could not save the report: ${(err as Error).message}`;
      return;
    }
    nameOpen = false;
    app.notify('Report saved');
    router.go(`report/${id}`);
  }
</script>

<div class="tabs">
  <Segmented
    bind:value={() => current, selectTab}
    label="Measurement"
    panel="measure-panel"
    options={[
      { value: 'photometry', label: 'Photometry' },
      { value: 'flicker', label: 'Flicker' },
    ]}
  />
</div>

<div id="measure-panel" role="tabpanel" aria-label={current === 'photometry' ? 'Photometry' : 'Flicker'}>
  {#if current === 'photometry'}
    <PhotometryPanel reading={app.reading} live={app.live} canStart={app.support.ok} />
  {:else}
    <FlickerPanel flicker={app.flicker} busy={app.flickerBusy} />
  {/if}
</div>

<p class="sr-only" aria-live="polite">{app.live ? 'Measuring' : app.flickerBusy || app.saving ? 'Measuring flicker' : app.reading ? 'Stopped' : ''}</p>

<div class="actions no-print">
  {#if app.saving}
    <button class="btn primary busy wide" disabled><span class="spinner"></span> Measuring flicker…</button>
  {:else if current === 'photometry'}
    {#if app.live}
      <button class="btn ink wide" onclick={() => app.stopLive()}><Square size={16} /> Stop</button>
    {:else if app.reading}
      <button class="btn" onclick={() => app.startLive()} disabled={app.busy || app.flickerBusy}><RotateCcw size={16} /> Test Again</button>
      <button class="btn primary" onclick={startSave} disabled={app.busy || app.flickerBusy}><Save size={16} /> Save as Report</button>
    {:else}
      <button class="btn primary wide" class:busy={app.busy} onclick={() => app.startLive()} disabled={app.busy || !app.support.ok}>
        {#if app.busy}<span class="spinner"></span> Connecting…{:else}<Play size={16} /> Start{/if}
      </button>
    {/if}
  {:else}
    <button
      class="btn primary wide"
      class:busy={app.busy || app.flickerBusy}
      onclick={() => app.measureFlicker()}
      disabled={app.busy || app.flickerBusy || !app.support.ok}
    >
      {#if app.flickerBusy}<span class="spinner"></span> Measuring…{:else if app.busy}<span class="spinner"></span> Connecting…{:else}<Play size={16} /> Start{/if}
    </button>
  {/if}
</div>

<Modal bind:open={nameOpen} title="Name this report">
  <form
    id="name-form"
    onsubmit={(e) => {
      e.preventDefault();
      void confirmSave();
    }}
  >
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={reportName} maxlength={MAX_NAME} placeholder="e.g. Kitchen downlight" autofocus aria-label="Report name" aria-describedby="name-hint" />
    <p class="hint" id="name-hint"><span>Shown in the report list</span><span class="num">{reportName.trim().length}/{MAX_NAME}</span></p>
  </form>
  {#snippet actions()}
    <button class="btn" onclick={() => (nameOpen = false)}>Cancel</button>
    <button class="btn primary" form="name-form" type="submit" disabled={!reportName.trim()}>Save</button>
  {/snippet}
</Modal>

<style>
  .tabs {
    max-width: 360px;
    margin: 0 auto 14px;
  }
  /* Docked bar: solid (translucent + blur) so content never shows through a fade. */
  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 10px;
    justify-content: center;
    padding: 12px 16px max(12px, env(safe-area-inset-bottom));
    margin: 16px -16px 0;
    background: var(--bar-bg);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
    border-top: 1px solid var(--border);
    z-index: 5;
  }
  .actions .btn {
    flex: 1;
    max-width: 280px;
    min-width: 0;
    min-height: 48px;
    border-radius: 14px;
    font-size: 1rem;
    white-space: normal;
    text-align: center;
    line-height: 1.2;
  }
  .hint {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 8px 2px 0;
    font-size: 0.8rem;
    color: var(--text-3);
  }
  @media (max-width: 560px) {
    .tabs {
      max-width: none;
    }
  }
  /* Past the 760px column: dock the bar to the column with a rounded top. */
  @media (min-width: 792px) {
    .actions {
      margin: 16px 0 0;
      border: 1px solid var(--border);
      border-bottom: 0;
      border-radius: 16px 16px 0 0;
    }
  }
</style>

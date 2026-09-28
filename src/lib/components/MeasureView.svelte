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

  let current = $state<'photometry' | 'flicker'>('photometry');
  $effect.pre(() => {
    current = tab;
  });
  $effect(() => {
    if (current !== tab) router.go(current === 'flicker' ? 'flicker' : '');
  });
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
    bind:value={current}
    label="Measurement"
    options={[
      { value: 'photometry', label: 'Photometry' },
      { value: 'flicker', label: 'Flicker' },
    ]}
  />
</div>

{#if current === 'photometry'}
  <PhotometryPanel reading={app.reading} live={app.live} />
{:else}
  <FlickerPanel flicker={app.flicker} busy={app.flickerBusy} />
{/if}

<div class="actions no-print">
  {#if app.saving}
    <button class="btn primary" disabled><span class="spinner"></span> Capturing flicker for the report…</button>
  {:else if current === 'photometry'}
    {#if app.live}
      <button class="btn primary wide" onclick={() => app.stopLive()}><Square size={16} /> Stop</button>
    {:else if app.reading}
      <button class="btn" onclick={() => app.startLive()} disabled={app.busy || app.flickerBusy}><RotateCcw size={16} /> Test Again</button>
      <button class="btn primary" onclick={startSave} disabled={app.busy || app.flickerBusy}><Save size={16} /> Save as Report</button>
    {:else}
      <button class="btn primary wide" onclick={() => app.startLive()} disabled={app.busy || !app.support.ok}>
        {#if app.busy}<span class="spinner"></span> Connecting…{:else}<Play size={16} /> Start{/if}
      </button>
    {/if}
  {:else}
    <button class="btn primary wide" onclick={() => app.measureFlicker()} disabled={app.busy || app.flickerBusy || !app.support.ok}>
      {#if app.flickerBusy}<span class="spinner"></span> Measuring…{:else if app.busy}<span class="spinner"></span> Connecting…{:else}<Play size={16} /> Start{/if}
    </button>
  {/if}
</div>

<Modal bind:open={nameOpen} title="Input report name">
  <form
    id="name-form"
    onsubmit={(e) => {
      e.preventDefault();
      void confirmSave();
    }}
  >
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={reportName} maxlength={MAX_NAME} placeholder="e.g. Kitchen downlight" autofocus aria-label="Report name" />
    <p class="hint">{reportName.trim().length}/{MAX_NAME} characters</p>
  </form>
  {#snippet actions()}
    <button class="btn" onclick={() => (nameOpen = false)}>Cancel</button>
    <button class="btn primary" form="name-form" type="submit" disabled={!reportName.trim()}>Save</button>
  {/snippet}
</Modal>

<style>
  .tabs {
    max-width: 320px;
    margin: 0 auto 14px;
  }
  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 10px;
    justify-content: center;
    padding: 14px 0 max(14px, env(safe-area-inset-bottom));
    margin-top: 14px;
    background: linear-gradient(to top, var(--bg) 70%, transparent);
    z-index: 5;
  }
  .actions .btn {
    flex: 1;
    max-width: 240px;
  }
  .hint {
    margin: 6px 0 0;
    font-size: 0.8rem;
  }
</style>

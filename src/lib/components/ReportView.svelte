<script lang="ts">
  import Share2 from '@lucide/svelte/icons/share-2';
  import Printer from '@lucide/svelte/icons/printer';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Download from '@lucide/svelte/icons/download';
  import Save from '@lucide/svelte/icons/save';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { app } from '../state.svelte';
  import { router } from '../router.svelte';
  import { deleteReport, download, getReport, newId, reportFromShare, reportsToCsv, reportsToJson, saveReport, shareLink, type Report } from '../reports';
  import { formatDateTime } from '../format';
  import PhotometryPanel from './PhotometryPanel.svelte';
  import FlickerPanel from './FlickerPanel.svelte';
  import Modal from './Modal.svelte';

  let { id = null, code = null }: { id?: string | null; code?: string | null } = $props();

  let report = $state.raw<Report | null>(null);
  let failed = $state<string | null>(null);
  let confirmOpen = $state(false);
  let moreOpen = $state(false);
  const shared = $derived(!!code);

  $effect(() => {
    const target = { id, code };
    report = null;
    failed = null;
    (async () => {
      try {
        const r = target.code ? await reportFromShare(target.code) : target.id ? await getReport(target.id) : null;
        if (!r) failed = 'This report no longer exists.';
        else report = r;
      } catch (err) {
        failed = `This link could not be opened (${(err as Error).message}).`;
      }
    })();
  });

  async function share() {
    if (!report) return;
    const url = shared ? location.href : await shareLink(report);
    if (navigator.share) {
      try {
        await navigator.share({ title: report.title, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      app.notify('Link copied');
    } catch {
      app.error = `Copy this link to share the report: ${url}`;
    }
  }

  async function keep() {
    if (!report) return;
    const copy = { ...report, id: newId() };
    try {
      await saveReport(copy);
    } catch (err) {
      app.error = `Could not save the report: ${(err as Error).message}`;
      return;
    }
    app.notify('Saved to your reports');
    router.replace(`report/${copy.id}`);
  }

  async function remove() {
    if (!report) return;
    await deleteReport(report.id);
    confirmOpen = false;
    router.replace('reports');
  }

  const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'report';

  function more(action: () => void) {
    moreOpen = false;
    action();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (moreOpen = false)} />

{#if failed}
  <div class="card"><p>{failed}</p><a class="btn" href="#/reports">Back to reports</a></div>
{:else if !report}
  <p class="muted">Loading…</p>
{:else}
  <header class="head card">
    <div>
      {#if shared}<div class="kicker">Shared test report</div>{/if}
      <h2>{report.title}</h2>
      <p class="muted">{formatDateTime(report.createdAt)}{report.device ? ` · ${report.device}` : ''}</p>
    </div>
    <div class="acts no-print">
      {#if shared}
        <button class="btn small primary" onclick={keep}><Save size={15} /> Save to my reports</button>
      {/if}
      <button class="btn small" onclick={share}><Share2 size={15} /> Share</button>
      <button class="btn small" onclick={() => window.print()}><Printer size={15} /> Print / PDF</button>
      <span class="more">
        <button class="btn small more-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={moreOpen} onclick={() => (moreOpen = !moreOpen)}
          ><Ellipsis size={18} /></button
        >
        {#if moreOpen}
          <button class="scrim" aria-label="Close menu" tabindex="-1" onclick={() => (moreOpen = false)}></button>
          <div class="menu" role="menu">
            <button role="menuitem" onclick={() => more(() => download(`${safeName(report!.title)}.csv`, reportsToCsv([report!]), 'text/csv'))}
              ><Download size={16} /> Download CSV</button
            >
            <button role="menuitem" onclick={() => more(() => download(`${safeName(report!.title)}.json`, reportsToJson([report!]), 'application/json'))}
              ><Download size={16} /> Download JSON</button
            >
            {#if !shared}
              <hr />
              <button role="menuitem" class="danger" onclick={() => more(() => (confirmOpen = true))}><Trash2 size={16} /> Delete report</button>
            {/if}
          </div>
        {/if}
      </span>
    </div>
  </header>

  <h3 class="section">Photometry</h3>
  <PhotometryPanel reading={report.reading} />

  <h3 class="section flicker">Flicker</h3>
  {#if report.flicker}
    <FlickerPanel flicker={report.flicker} />
  {:else}
    <p class="muted card">No flicker measurement in this report.</p>
  {/if}
{/if}

<Modal bind:open={confirmOpen} title="Delete report" variant="sheet">
  <p>Delete “{report?.title ?? 'this report'}”? This can't be undone.</p>
  {#snippet actions()}
    <button class="btn" onclick={() => (confirmOpen = false)}>Cancel</button>
    <button class="btn danger" onclick={remove}>Delete</button>
  {/snippet}
</Modal>

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .kicker {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
  }
  h2 {
    font-size: 1.4rem;
    margin-top: 2px;
  }
  .head p {
    margin: 4px 0 0;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .more {
    position: relative;
  }
  .more-btn {
    width: 38px;
    padding: 0;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 3;
    background: transparent;
    border: none;
    cursor: default;
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 4;
    min-width: 210px;
    display: flex;
    flex-direction: column;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--surface-2);
  }
  .menu button :global(svg) {
    color: var(--text-2);
  }
  .menu .danger,
  .menu .danger :global(svg) {
    color: var(--bad);
  }
  .menu hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 4px 0;
    width: 100%;
  }
  .section {
    font-size: 1.05rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    margin: 28px 2px 12px;
  }
  @media print {
    .section.flicker {
      break-before: page;
    }
  }
</style>

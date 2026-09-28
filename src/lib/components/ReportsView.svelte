<script lang="ts">
  import Share2 from '@lucide/svelte/icons/share-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Download from '@lucide/svelte/icons/download';
  import Upload from '@lucide/svelte/icons/upload';
  import FileText from '@lucide/svelte/icons/file-text';
  import { app } from '../state.svelte';
  import { router } from '../router.svelte';
  import { deleteReport, download, importReports, listReports, reportsToCsv, reportsToJson, shareLink, type Report } from '../reports';
  import { dayKey, formatPhotometry, formatTime, RISK_LABEL } from '../format';
  import Modal from './Modal.svelte';

  let reports = $state.raw<Report[]>([]);
  let loading = $state(true);
  let day = $state('');
  let editing = $state(false);
  let selected = $state<Set<string>>(new Set());
  let confirmOpen = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  async function load() {
    loading = true;
    try {
      reports = await listReports();
    } catch (err) {
      app.error = `Could not read saved reports: ${(err as Error).message}`;
    } finally {
      loading = false;
    }
  }
  void load();

  const visible = $derived(day ? reports.filter((r) => dayKey(r.createdAt) === day) : reports);
  // Never act on reports the filter hides.
  $effect(() => {
    void day;
    selected = new Set();
  });
  function summary(r: Report): string {
    const v = formatPhotometry(r.reading);
    const parts = [formatTime(r.createdAt), `${v.lux} lx`, `${v.cct} K`];
    if (v.ra !== '---') parts.push(`Ra ${v.ra}`);
    if (r.flicker) parts.push(RISK_LABEL[r.flicker.risk]);
    return parts.join(' · ');
  }
  const groups = $derived.by(() => {
    const out: { day: string; items: Report[] }[] = [];
    for (const r of visible) {
      const k = dayKey(r.createdAt);
      const g = out[out.length - 1];
      if (g && g.day === k) g.items.push(r);
      else out.push({ day: k, items: [r] });
    }
    return out;
  });
  const BADGE = ['#FFAE71', '#B8D071', '#75CFD8', '#7EAFE1', '#B0B3E9'];

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function selectAll() {
    selected = selected.size === visible.length ? new Set() : new Set(visible.map((r) => r.id));
  }

  async function removeSelected() {
    const visibleIds = new Set(visible.map((r) => r.id));
    for (const id of selected) if (visibleIds.has(id)) await deleteReport(id);
    confirmOpen = false;
    editing = false;
    selected = new Set();
    await load();
  }

  async function share(r: Report) {
    const url = await shareLink(r);
    if (navigator.share) {
      try {
        await navigator.share({ title: r.title, text: `Light Master report: ${r.title}`, url });
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

  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportCsv() {
    download(`light-master-reports-${stamp()}.csv`, reportsToCsv(visible), 'text/csv');
  }
  function exportJson() {
    download(`light-master-reports-${stamp()}.json`, reportsToJson(visible), 'application/json');
  }
  async function onImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const n = await importReports(await file.text());
      app.notify(`Imported ${n} report${n === 1 ? '' : 's'}`);
      await load();
    } catch (err) {
      app.error = `Import failed: ${(err as Error).message}`;
    } finally {
      (e.target as HTMLInputElement).value = '';
    }
  }

  const dayLabel = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
</script>

<div class="toolbar">
  <label class="date">
    <span class="sr-only">Filter by day</span>
    <input type="date" bind:value={day} min="2022-01-01" max={dayKey(Date.now())} />
  </label>
  {#if day}<button class="btn small" onclick={() => (day = '')}>All days</button>{/if}
  <span class="spacer"></span>
  {#if reports.length}
    <button class="btn small" onclick={() => ((editing = !editing), (selected = new Set()))}>{editing ? 'Done' : 'Edit'}</button>
  {/if}
</div>

{#if editing}
  <div class="toolbar edit">
    <button class="btn small" onclick={selectAll}>{selected.size === visible.length && visible.length ? 'Select none' : 'Select all'}</button>
    <span class="muted">{selected.size} report(s) selected</span>
    <span class="spacer"></span>
    <button class="btn small danger" disabled={!selected.size} onclick={() => (confirmOpen = true)}><Trash2 size={15} /> Delete</button>
  </div>
{/if}

{#if loading}
  <p class="muted center">Loading…</p>
{:else if !visible.length}
  <div class="empty card">
    <FileText size={36} />
    <p>{reports.length ? 'No reports on this day.' : 'No reports yet. Take a measurement and choose “Save as Report”.'}</p>
  </div>
{:else}
  {#each groups as g (g.day)}
    <h3 class="day">{dayLabel(g.day)}</h3>
    <ul class="list card">
      {#each g.items as r, i (r.id)}
        <li>
          {#if editing}
            <input type="checkbox" checked={selected.has(r.id)} onchange={() => toggle(r.id)} aria-label="Select {r.title}" />
          {/if}
          <span class="badge" style:background={BADGE[i % 5]}>{i + 1}</span>
          <a class="main" href="#/report/{encodeURIComponent(r.id)}">
            <span class="title">{r.title}</span>
            <span class="sub muted">{summary(r)}</span>
          </a>
          {#if !editing}
            <button class="icon-btn" aria-label="Share {r.title}" onclick={() => share(r)}><Share2 size={17} /></button>
          {/if}
        </li>
      {/each}
    </ul>
  {/each}
{/if}

<div class="io">
  <button class="btn small" onclick={exportCsv} disabled={!visible.length}><Download size={15} /> Export CSV</button>
  <button class="btn small" onclick={exportJson} disabled={!visible.length}><Download size={15} /> Export JSON</button>
  <button class="btn small" onclick={() => fileInput?.click()}><Upload size={15} /> Import JSON</button>
  <input type="file" accept="application/json,.json" hidden bind:this={fileInput} onchange={onImport} />
</div>
<p class="muted note">Reports are stored in this browser only. Export them to keep a copy or move them to another device.</p>

<Modal bind:open={confirmOpen} title="Delete reports">
  <p>You are deleting {selected.size} report(s). This cannot be undone.</p>
  {#snippet actions()}
    <button class="btn" onclick={() => (confirmOpen = false)}>Cancel</button>
    <button class="btn danger" onclick={removeSelected}>Delete</button>
  {/snippet}
</Modal>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .toolbar.edit {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 8px 10px;
  }
  .date {
    width: 170px;
  }
  .spacer {
    flex: 1;
  }
  .day {
    font-size: 0.82rem;
    color: var(--text-3);
    font-weight: 600;
    margin: 16px 4px 6px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  li + li {
    border-top: 1px solid var(--border);
  }
  .badge {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: #fff;
    font-weight: 700;
    font-size: 0.85rem;
    flex: none;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    color: inherit;
    text-decoration: none;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 0.82rem;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--text-3);
    text-align: center;
    padding: 32px 16px;
  }
  .io {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 18px;
  }
  .note {
    font-size: 0.82rem;
  }
  .center {
    text-align: center;
  }
  input[type='checkbox'] {
    width: 18px;
    height: 18px;
  }
</style>

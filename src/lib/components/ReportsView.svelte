<script lang="ts">
  import Share2 from '@lucide/svelte/icons/share-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Download from '@lucide/svelte/icons/download';
  import Upload from '@lucide/svelte/icons/upload';
  import FileText from '@lucide/svelte/icons/file-text';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Play from '@lucide/svelte/icons/play';
  import X from '@lucide/svelte/icons/x';
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
  /** Row line 1: the key values. */
  function values(r: Report): string {
    const v = formatPhotometry(r.reading);
    const parts = [`${v.lux} lx`, `${v.cct} K`];
    if (v.ra !== '---') parts.push(`Ra ${v.ra}`);
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
  const chipLabel = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const deleteTitle = $derived(selected.size === 1 ? 'Delete report' : 'Delete reports');
  const deleteText = $derived.by(() => {
    if (selected.size === 1) {
      const [id] = selected;
      const r = visible.find((x) => x.id === id);
      return `Delete “${r?.title ?? 'this report'}”? This can't be undone.`;
    }
    return `Delete ${selected.size} reports? This can't be undone.`;
  });

  function openPicker(e: MouseEvent) {
    // Desktop Chrome only opens the calendar from its icon; open it from anywhere on the chip.
    try {
      (e.currentTarget as HTMLInputElement).showPicker();
    } catch {
      // not supported or not allowed: the native control still works
    }
  }
</script>

{#if reports.length}
  <div class="toolbar">
    <label class="filter" class:set={day}>
      <CalendarDays size={16} />
      <span>{day ? chipLabel(day) : 'All days'}</span>
      <ChevronDown size={16} />
      <input type="date" bind:value={day} min="2022-01-01" max={dayKey(Date.now())} aria-label="Filter by day" onclick={openPicker} />
    </label>
    {#if day}<button class="icon-btn clear" aria-label="Show all days" onclick={() => (day = '')}><X size={16} /></button>{/if}
    <span class="spacer"></span>
    <button class="btn small" onclick={() => ((editing = !editing), (selected = new Set()))}>{editing ? 'Done' : 'Edit'}</button>
  </div>
{/if}

{#if editing}
  <div class="toolbar edit">
    <button class="btn small" onclick={selectAll}>{selected.size === visible.length && visible.length ? 'Select none' : 'Select all'}</button>
    <span class="muted">{selected.size} selected</span>
    <span class="spacer"></span>
    <button class="btn small danger" disabled={!selected.size} onclick={() => (confirmOpen = true)}><Trash2 size={15} /> Delete</button>
  </div>
{/if}

{#if loading}
  <p class="muted center">Loading…</p>
{:else if !visible.length}
  <div class="empty card">
    <span class="ico"><FileText size={26} /></span>
    {#if reports.length}
      <h3>Nothing on this day</h3>
      <p>Pick another day or show all days.</p>
      <button class="btn small" onclick={() => (day = '')}>Show all days</button>
    {:else}
      <h3>No reports yet</h3>
      <p>Measure a light, then tap Save as Report to keep it here.</p>
      <a class="btn primary" href="#/"><Play size={16} /> Start measuring</a>
    {/if}
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
            <span class="vals">{values(r)}</span>
            <span class="meta"
              >{formatTime(r.createdAt)}{#if r.flicker}{' · '}<i class="dot {r.flicker.risk}"></i>{RISK_LABEL[r.flicker.risk]}{/if}</span
            >
          </a>
          {#if !editing}
            <button class="icon-btn" aria-label="Share {r.title}" onclick={() => share(r)}><Share2 size={18} /></button>
          {/if}
        </li>
      {/each}
    </ul>
  {/each}
{/if}

<section class="card backup">
  <h3 class="card-title">Backup &amp; transfer</h3>
  <div class="io">
    <button class="btn small" onclick={exportCsv} disabled={!visible.length}><Download size={15} /> Export CSV</button>
    <button class="btn small" onclick={exportJson} disabled={!visible.length}><Download size={15} /> Export JSON</button>
    <button class="btn small" onclick={() => fileInput?.click()}><Upload size={15} /> Import JSON</button>
    <input type="file" accept="application/json,.json" hidden bind:this={fileInput} onchange={onImport} />
  </div>
  <p class="muted note">Reports are stored in this browser only. Export them to keep a copy or move them to another device.</p>
</section>

<Modal bind:open={confirmOpen} title={deleteTitle} variant="sheet">
  <p>{deleteText}</p>
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
  /* Day filter: a chip over a transparent native date input (keeps the platform picker). */
  .filter {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text);
    cursor: pointer;
  }
  .filter.set {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
  }
  .filter :global(svg) {
    color: var(--text-2);
    flex: none;
  }
  .filter input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .filter:focus-within {
    outline: 2px solid var(--info);
    outline-offset: 2px;
  }
  .clear {
    margin-left: -6px;
  }
  .spacer {
    flex: 1;
  }
  .day {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
    padding: 10px 6px 10px 14px;
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
    /* The app's pastel badges: dark numerals (white on these is under 2.4:1). */
    color: #1b1e24;
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
  .vals,
  .meta {
    font-size: 0.82rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vals {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .meta {
    color: var(--text-3);
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin: 0 5px 0 1px;
    vertical-align: 0;
  }
  .dot.none {
    background: var(--status-good);
  }
  .dot.low {
    background: var(--status-warning);
  }
  .dot.high {
    background: var(--status-critical);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    padding: 36px 20px;
  }
  .empty .ico {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: var(--accent-bg);
    color: var(--accent-strong);
    margin-bottom: 6px;
  }
  .empty h3 {
    font-size: 1.1rem;
  }
  .empty p {
    margin: 0 0 10px;
    color: var(--text-2);
    max-width: 32ch;
  }
  .backup {
    margin-top: 18px;
  }
  .io {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .note {
    font-size: 0.82rem;
    margin: 10px 0 0;
  }
  .center {
    text-align: center;
  }
  input[type='checkbox'] {
    width: 18px;
    height: 18px;
  }
</style>

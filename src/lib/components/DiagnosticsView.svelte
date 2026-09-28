<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import { app } from '../state.svelte';

  let releasing = $state(false);
  let result = $state<string | null>(null);

  const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour12: false }) + '.' + String(ts % 1000).padStart(3, '0');
  const text = $derived(app.logs.map((l) => `${time(l.ts)} ${l.level.toUpperCase().padEnd(5)} ${l.message}`).join('\n'));

  async function copy() {
    const header = `Light Master web UI diagnostics\n${navigator.userAgent}\n${new Date().toISOString()}\n\n`;
    await navigator.clipboard.writeText(header + text);
    app.notify('Log copied');
  }

  async function release() {
    releasing = true;
    const r = await app.forceRelease();
    releasing = false;
    result = `Released ${r.released} link(s) and forgot ${r.forgotten} of ${r.devices} permitted device(s). The next Connect shows a fresh chooser.`;
  }
</script>

<section class="card">
  <h3 class="card-title">Connection</h3>
  <p class="state">
    <i class="dot" class:on={app.connected} class:busy={app.busy} aria-hidden="true"></i>
    <span>State: <strong>{app.state}</strong>{app.message ? ` — ${app.message}` : ''}</span>
  </p>
  {#if app.reading?.kSensor}
    <p class="muted small">Calibration (kSensor): {app.reading.kSensor.map((k) => k.toFixed(4)).join(', ')}</p>
  {/if}
  <div class="row">
    <button class="btn small danger" onclick={release} disabled={releasing}>Force disconnect</button>
    <label class="check"><input type="checkbox" checked={app.verbose} onchange={(e) => app.setVerbose((e.target as HTMLInputElement).checked)} /> Log raw BLE frames</label>
  </div>
  {#if result}<p class="muted small">{result}</p>{/if}
</section>

<section class="card log-card">
  <h3 class="card-title">
    Log
    <span class="row">
      <button class="btn small" onclick={copy} disabled={!app.logs.length}><Copy size={14} /> Copy</button>
      <button class="btn small" onclick={() => app.clearLog()} disabled={!app.logs.length}>Clear</button>
    </span>
  </h3>
  {#if app.logs.length}
    <pre class="log">{#each app.logs as l, i (i)}<span class={l.level}>{time(l.ts)} {l.message}
</span>{/each}</pre>
  {:else}
    <p class="muted">Nothing logged yet. Connect a meter to see each step.</p>
  {/if}
</section>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .state {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 6px;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-3);
    transform: translateY(-1px);
  }
  .dot.on {
    background: var(--good);
  }
  .dot.busy {
    background: var(--accent);
  }
  .small {
    font-size: 0.82rem;
    word-break: break-word;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
  }
  .log-card {
    margin-top: 12px;
  }
  .log {
    margin: 0;
    max-height: 60vh;
    overflow: auto;
    font: 12px/1.5 var(--mono);
    background: var(--surface-2);
    border-radius: 10px;
    padding: 10px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* One entry per block with a hanging indent under the 12-character timestamp. */
  .log span {
    display: block;
    padding-left: 13ch;
    text-indent: -13ch;
  }
  .log span + span {
    margin-top: 2px;
  }
  .warn {
    color: var(--warn-text);
  }
  .error {
    color: var(--bad);
  }
  .debug {
    color: var(--text-3);
  }
</style>

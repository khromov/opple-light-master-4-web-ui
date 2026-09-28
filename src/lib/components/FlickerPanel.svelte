<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { FlickerResult } from '../science/flicker';
  import { RISK_LABEL, formatFlicker } from '../format';
  import RiskChart from './RiskChart.svelte';
  import LineChart from './LineChart.svelte';

  let { flicker, busy = false }: { flicker: FlickerResult | null; busy?: boolean } = $props();

  const view = $derived(formatFlicker(flicker));
  const waveX = $derived(flicker ? flicker.wave.map((_, i) => (i * flicker.sampleIntervalUs) / 1000) : []);
  const fftX = $derived(flicker ? flicker.spectrum.slice(1).map((_, i) => (i + 1) * flicker.binHz) : []);
  const fftY = $derived(flicker ? flicker.spectrum.slice(1) : []);
  const peakIndex = $derived(fftY.length ? fftY.indexOf(Math.max(...fftY)) : null);
  let showExtras = $state(false);
  const extrasId = `fft-${Math.random().toString(36).slice(2)}`;
  const isNone = (v: string) => v === '---' || v === '--';

  // Units are shown one way everywhere: value, then a small unit. The '%' of the
  // app's modulation string is split off for display only.
  const rows = $derived([
    { label: 'Flicker Index', value: view.flickerIndex, unit: '' },
    { label: 'Modulation depth', value: view.modulation.replace(/%$/, ''), unit: view.modulation.endsWith('%') ? '%' : '' },
    { label: 'Frequency', value: view.frequency, unit: flicker ? 'Hz' : '' },
  ]);
</script>

<section class="card">
  <h3 class="card-title">Risk assessment</h3>
  <div
    class="verdict"
    class:none={!busy && view.risk === 'none'}
    class:low={!busy && view.risk === 'low'}
    class:high={!busy && view.risk === 'high'}
    class:empty={!busy && !view.risk}
    aria-live="polite"
  >
    {#if busy}
      <span class="spinner"></span> Measuring flicker…
    {:else if view.risk}
      {#if view.risk === 'none'}<CircleCheck size={22} />{:else if view.risk === 'low'}<TriangleAlert size={22} />{:else}<OctagonAlert size={22} />{/if}
      {RISK_LABEL[view.risk]}
    {:else}
      Not measured yet
    {/if}
  </div>
  <RiskChart frequency={flicker?.frequency ?? null} modulation={flicker?.modulation ?? null} />
  <dl class="stats">
    {#each rows as r (r.label)}
      <div>
        <dt>{r.label}</dt>
        <dd class:placeholder={isNone(r.value)}>{r.value}{#if r.unit}<span class="unit">{r.unit}</span>{/if}</dd>
      </div>
    {/each}
  </dl>
  {#if flicker?.stale}
    <div class="quality saturated" role="note">
      <TriangleAlert size={16} />
      <p><strong>Stale capture</strong>The meter resent its previous waveform instead of a new capture, so these values may be out of date. Measure again.</p>
    </div>
  {/if}
  {#if flicker?.refineError}
    <div class="quality weak" role="note">
      <TriangleAlert size={16} />
      <p>
        <strong>Frequency not refined</strong>The refining capture failed ({flicker.refineError}), so the frequency comes from the coarse 26 µs capture only.
        Measure again for the app's result.
      </p>
    </div>
  {/if}
  {#if flicker?.quality && flicker.quality.status !== 'ok'}
    <div class="quality {flicker.quality.status}" role="note">
      <TriangleAlert size={16} />
      <p>
        {#if flicker.quality.status === 'saturated'}
          <strong>Sensor overloaded</strong>At {flicker.lux !== null ? `${Math.round(flicker.lux)} lx` : 'this brightness'} the flicker sensor saturates, so these
          values aren't meaningful. Move the meter back (aim for roughly 300–3 000 lx) and measure again.
        {:else if flicker.quality.status === 'too-dim'}
          <strong>Too dark for flicker</strong>Too little light reaches the flicker sensor for a result. Move the meter closer to the light.
        {:else}
          <strong>Weak signal</strong>Only {flicker.quality.level.toFixed(0)} counts above the sensor's dark level, so a few percent of modulation (and the
          frequency) may be noise. Aim for roughly 300–3 000 lx for a reliable reading.
        {/if}
      </p>
    </div>
  {:else if flicker?.isDC}
    <p class="note muted">No periodic component above the noise: the light is steady, so the frequency is not meaningful.</p>
  {/if}
</section>

<section class="card">
  <h3 class="card-title">Raw data</h3>
  <LineChart
    xs={waveX}
    ys={flicker ? flicker.wave : []}
    xLabel="Time (ms)"
    yLabel="lx"
    fmtX={(v) => v.toFixed(v < 10 && v % 1 ? 1 : 0)}
    fmtY={(v) => v.toFixed(v < 10 && v % 1 ? 1 : 0)}
    ariaLabel="Flicker waveform in lux over time"
    emptyText="No capture yet"
  />
  <dl class="stats">
    <div><dt>Maximum</dt><dd class:placeholder={isNone(view.max)}>{view.max}<span class="unit">lx</span></dd></div>
    <div><dt>Minimum</dt><dd class:placeholder={isNone(view.min)}>{view.min}<span class="unit">lx</span></dd></div>
    <div><dt>Average</dt><dd class:placeholder={isNone(view.avg)}>{view.avg}<span class="unit">lx</span></dd></div>
  </dl>
</section>

{#if flicker}
  <section class="card">
    <button class="disclosure" aria-expanded={showExtras} aria-controls={extrasId} onclick={() => (showExtras = !showExtras)}>
      <span class="card-title">Frequency spectrum</span>
      <span class="badge-extra" title="Not in the Opple app">Extra</span>
      <ChevronDown class="chev" size={20} />
    </button>
    {#if showExtras}
      <div id={extrasId}>
      <p class="muted small note">Extra readings from the same measurement. The Opple app doesn't show these.</p>
      <p class="muted small">
        FFT of the {({ 25: '26 µs', 146: '150 µs', 11: '12.285 µs' })[flicker.period]} capture ({flicker.binHz.toFixed(1)} Hz per bin). The reported frequency
        {flicker.captures.length > 1 ? `was refined with a ${flicker.captures[1] === 146 ? '150 µs' : '12.285 µs'} capture` : 'comes from this capture'}.
      </p>
      <LineChart
        xs={fftX}
        ys={fftY}
        xLabel="Frequency (Hz)"
        yLabel="Amplitude"
        fmtX={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : v.toFixed(0))}
        fmtY={(v) => v.toFixed(v < 1 ? 2 : 1)}
        marker={peakIndex}
        ariaLabel="Frequency spectrum of the flicker waveform"
        height={180}
      />
      <dl class="extra-grid">
        <div><dt>Captures</dt><dd>{flicker.captures.map((p) => ({ 25: '26 µs', 146: '150 µs', 11: '12.285 µs' })[p]).join(' + ')}</dd></div>
        <div><dt>Sensor range</dt><dd>{flicker.dataType}</dd></div>
        <div><dt>Capture lux</dt><dd>{flicker.lux !== null ? flicker.lux.toFixed(0) : '---'}</dd></div>
        <div><dt>Flicker %</dt><dd>{flicker.modulation.toFixed(2)} %</dd></div>
      </dl>
      </div>
    {/if}
  </section>
{/if}

<style>
  section + section {
    margin-top: 12px;
  }
  /* The verdict is the tab's answer: a tinted banner with a status stripe.
     Icon + label carry the meaning; the text stays in ink. */
  .verdict {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.35rem;
    font-weight: 700;
    margin: -2px 0 14px;
    min-height: 52px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .verdict.none {
    background: color-mix(in srgb, var(--status-good) 12%, var(--surface));
    box-shadow: inset 3px 0 0 var(--status-good);
  }
  .verdict.low {
    background: color-mix(in srgb, var(--status-warning) 16%, var(--surface));
    box-shadow: inset 3px 0 0 var(--status-warning);
  }
  .verdict.high {
    background: color-mix(in srgb, var(--status-critical) 12%, var(--surface));
    box-shadow: inset 3px 0 0 var(--status-critical);
  }
  .verdict.empty {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-2);
  }
  .verdict.none :global(svg) {
    color: var(--status-good);
  }
  .verdict.low :global(svg) {
    color: var(--status-warning);
  }
  .verdict.high :global(svg) {
    color: var(--status-critical);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 12px 0 0;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .stats div {
    text-align: center;
  }
  dt {
    font-size: 0.78rem;
    color: var(--text-3);
    font-weight: 600;
  }
  dd {
    margin: 2px 0 0;
    font-size: 1.25rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  dd.placeholder {
    font-weight: 500;
  }
  .unit {
    font-size: 0.72em;
    color: var(--text-3);
    font-weight: 600;
    margin-left: 0.18em;
  }
  .note {
    font-size: 0.85rem;
    margin: 10px 0 0;
  }
  .quality {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 0.86rem;
    color: var(--text-2);
    background: color-mix(in srgb, var(--status-warning) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--status-warning) 40%, var(--border));
  }
  .quality p {
    margin: 0;
  }
  .quality strong {
    display: block;
    color: var(--text);
    margin-bottom: 2px;
  }
  .quality :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--status-warning);
  }
  .quality.saturated,
  .quality.too-dim {
    background: color-mix(in srgb, var(--status-critical) 10%, transparent);
    border-color: color-mix(in srgb, var(--status-critical) 40%, var(--border));
  }
  .quality.saturated :global(svg),
  .quality.too-dim :global(svg) {
    color: var(--status-critical);
  }
  .small {
    font-size: 0.82rem;
  }
  .note {
    margin: 12px 0 8px;
  }
  .extra-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px 16px;
    margin: 12px 0 0;
  }
  .extra-grid dd {
    font-size: 0.95rem;
  }
</style>

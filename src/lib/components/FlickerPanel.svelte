<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
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

  const rows = $derived([
    { label: 'Flicker Index', value: view.flickerIndex, unit: '' },
    { label: 'Modulation depth', value: view.modulation, unit: '' },
    { label: 'Frequency', value: view.frequency, unit: flicker ? 'Hz' : '' },
  ]);
</script>

<section class="card">
  <h3 class="card-title">Risk assessment</h3>
  <div class="verdict" class:none={view.risk === 'none'} class:low={view.risk === 'low'} class:high={view.risk === 'high'} aria-live="polite">
    {#if busy}
      <span class="spinner"></span> Measuring flicker…
    {:else if view.risk}
      {#if view.risk === 'none'}<CircleCheck size={22} />{:else if view.risk === 'low'}<TriangleAlert size={22} />{:else}<OctagonAlert size={22} />{/if}
      {RISK_LABEL[view.risk]}
    {:else}
      <span class="muted">---</span>
    {/if}
  </div>
  <RiskChart frequency={flicker?.frequency ?? null} modulation={flicker?.modulation ?? null} />
  <dl class="stats">
    {#each rows as r (r.label)}
      <div>
        <dt>{r.label}</dt>
        <dd>{r.value}{#if r.unit}<span class="unit"> {r.unit}</span>{/if}</dd>
      </div>
    {/each}
  </dl>
  {#if flicker?.stale}
    <div class="quality saturated" role="note">
      <TriangleAlert size={16} />
      <span>The meter sent its previous waveform again instead of a new capture, so these values may be out of date. Measure again.</span>
    </div>
  {/if}
  {#if flicker?.refineError}
    <div class="quality weak" role="note">
      <TriangleAlert size={16} />
      <span>The frequency could not be refined ({flicker.refineError}), so it comes from the coarse 26 µs capture only. Measure again for the app's result.</span>
    </div>
  {/if}
  {#if flicker?.quality && flicker.quality.status !== 'ok'}
    <div class="quality {flicker.quality.status}" role="note">
      <TriangleAlert size={16} />
      <span>
        {#if flicker.quality.status === 'saturated'}
          The flicker sensor is overloaded ({flicker.lux !== null ? `${Math.round(flicker.lux)} lx` : 'too bright'}), so these values are not meaningful. Move the
          meter further from the light (to roughly 300–3 000 lx) and measure again.
        {:else if flicker.quality.status === 'too-dim'}
          Too little light reaches the flicker sensor for a result. Move the meter closer to the light.
        {:else}
          Weak signal ({flicker.quality.level.toFixed(0)} counts above the sensor's dark level): modulation of a few percent and the frequency can be sensor
          noise. More light (roughly 300–3 000 lx) gives a more reliable reading.
        {/if}
      </span>
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
  />
  <dl class="stats">
    <div><dt>Maximum</dt><dd>{view.max}<span class="unit"> lx</span></dd></div>
    <div><dt>Minimum</dt><dd>{view.min}<span class="unit"> lx</span></dd></div>
    <div><dt>Average</dt><dd>{view.avg}<span class="unit"> lx</span></dd></div>
  </dl>
</section>

{#if flicker}
  <section class="card">
    <button class="extras-toggle" aria-expanded={showExtras} onclick={() => (showExtras = !showExtras)}>
      <span class="card-title" style="margin:0">Frequency spectrum</span>
      <span class="muted small">{showExtras ? 'Hide' : 'Show'} · not in the Opple app</span>
    </button>
    {#if showExtras}
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
    {/if}
  </section>
{/if}

<style>
  section + section {
    margin-top: 12px;
  }
  .verdict {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.5rem;
    font-weight: 700;
    margin: -2px 0 10px;
    min-height: 36px;
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
  }
  .unit {
    font-size: 0.8rem;
    color: var(--text-3);
    font-weight: 500;
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
  .extras-toggle {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .small {
    font-size: 0.82rem;
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

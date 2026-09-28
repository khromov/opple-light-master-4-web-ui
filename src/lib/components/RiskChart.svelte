<script lang="ts">
  import { log10, fmtCompact } from '../charts/scale';
  import { chartLowRiskLimit, chartNoRiskLimit } from '../science/flicker';

  let { frequency, modulation }: { frequency: number | null; modulation: number | null } = $props();

  let cw = $state(0);
  const W = $derived(Math.max(260, cw || 360));
  const H = $derived(Math.round(Math.min(330, Math.max(230, W * 0.6))));
  const M = { l: 38, r: 10, t: 10, b: 30 };
  const F: [number, number] = [3, 10000];
  const D: [number, number] = [0.1, 100];
  const sx = $derived(log10(F, [M.l, W - M.r]));
  const sy = $derived(log10(D, [H - M.b, M.t]));

  const clampD = (d: number) => Math.min(D[1], Math.max(D[0], d));
  const freqs: number[] = [];
  for (let e = Math.log10(F[0]); e <= Math.log10(F[1]) + 1e-9; e += 0.02) freqs.push(10 ** e);

  const pt = (f: number, d: number) => `${sx(f).toFixed(1)},${sy(clampD(d)).toFixed(1)}`;
  const highLine = $derived(freqs.map((f) => pt(f, chartLowRiskLimit(f))));
  const noLine = $derived(freqs.map((f) => pt(f, chartNoRiskLimit(f))));

  const highZone = $derived(`M${highLine.join('L')}L${pt(F[1], 100)}L${pt(F[0], 100)}Z`);
  const noZone = $derived(`M${noLine.join('L')}L${pt(F[1], 0.1)}L${pt(F[0], 0.1)}Z`);
  const lowZone = $derived(`M${highLine.join('L')}L${[...noLine].reverse().join('L')}Z`);

  const xTicks = [3, 10, 30, 100, 300, 1000, 3000, 10000];
  const yTicks = [0.1, 1, 10, 100];

  // Placement: frequency clamped to 3..10 000 Hz as in the app; modulation kept on the chart (the app maps only exactly 0 to 0.1 %).
  const dot = $derived(
    frequency === null || modulation === null
      ? null
      : { x: sx(Math.max(3, Math.min(10000, frequency))), y: sy(Math.min(100, modulation === 0 ? 0.1 : Math.max(0.1, modulation))) },
  );
  let hover = $state(false);
</script>

<div class="chart" bind:clientWidth={cw}>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="IEEE PAR1789 flicker risk chart{dot ? `, measured ${modulation?.toFixed(2)} percent at ${frequency?.toFixed(0)} hertz` : ''}">
    <path d={noZone} class="zone good" />
    <path d={lowZone} class="zone warning" />
    <path d={highZone} class="zone critical" />
    {#each xTicks as t (t)}
      <line class="gridline" x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} />
      <text x={sx(t)} y={H - M.b + 15} text-anchor="middle">{fmtCompact(t)}</text>
    {/each}
    {#each yTicks as t (t)}
      <line class="gridline" x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
      <text x={M.l - 6} y={sy(t) + 4} text-anchor="end">{t}</text>
    {/each}
    <path d={`M${highLine.join('L')}`} class="edge critical" />
    <path d={`M${noLine.join('L')}`} class="edge good" />
    <line class="axisline" x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
    <line class="axisline" x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} />
    <text x={W - M.r} y={H - 2} text-anchor="end">Freq. (Hz)</text>
    <text x={M.l + 4} y={M.t + 11}>Modulation (%)</text>
    {#if dot}
      <circle cx={dot.x} cy={dot.y} r="6" class="dot" />
      <circle cx={dot.x} cy={dot.y} r="14" fill="transparent" role="presentation" onpointerenter={() => (hover = true)} onpointerleave={() => (hover = false)} />
    {/if}
  </svg>
  {#if hover && dot}
    <div class="tooltip" style:left="{(dot.x / W) * 100}%" style:top="{(dot.y / H) * 100}%">
      <strong>{modulation?.toFixed(2)}%</strong> <span>at {frequency?.toFixed(0)} Hz</span>
    </div>
  {/if}
  <div class="legend">
    <span><i class="sw good"></i>No risk</span>
    <span><i class="sw warning"></i>Low risk</span>
    <span><i class="sw critical"></i>High risk</span>
    <span class="caption">IEEE Standard PAR1789</span>
  </div>
</div>

<style>
  .zone {
    stroke: none;
  }
  .zone.good {
    fill: color-mix(in srgb, var(--status-good) 14%, transparent);
  }
  .zone.warning {
    fill: color-mix(in srgb, var(--status-warning) 20%, transparent);
  }
  .zone.critical {
    fill: color-mix(in srgb, var(--status-critical) 14%, transparent);
  }
  .edge {
    fill: none;
    stroke-width: 1.5;
  }
  .edge.good {
    stroke: var(--status-good);
  }
  .edge.critical {
    stroke: var(--status-critical);
  }
  .dot {
    fill: var(--text);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 0.8rem;
    color: var(--text-2);
    margin-top: 6px;
    align-items: center;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    display: inline-block;
  }
  .sw.good {
    background: var(--status-good);
  }
  .sw.warning {
    background: var(--status-warning);
  }
  .sw.critical {
    background: var(--status-critical);
  }
  .caption {
    margin-left: auto;
    color: var(--text-3);
  }
</style>

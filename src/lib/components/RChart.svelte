<script lang="ts">
  import { linear } from '../charts/scale';

  let { values, labels }: { values: number[]; labels: string[] } = $props();

  let cw = $state(0);
  const W = $derived(Math.max(260, cw || 360));
  const H = 200;
  const M = { l: 34, r: 8, t: 10, b: 24 };
  const n = 14;

  const lo = $derived(Math.min(0, ...values) < 0 ? -100 : 0);
  const sy = $derived(linear([lo, 100], [H - M.b, M.t]));
  const ticks = $derived(lo < 0 ? [-100, -50, 0, 50, 100] : [0, 25, 50, 75, 100]);
  const band = $derived((W - M.l - M.r) / n);
  const bw = $derived(Math.min(24, band * 0.62));
  let hover = $state<number | null>(null);

  /** Column path with a 4px rounded data end and a square baseline. */
  function column(i: number, v: number): string {
    const x0 = M.l + band * i + (band - bw) / 2;
    const y0 = sy(0);
    const y1 = sy(v);
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    const r = Math.min(4, h, bw / 2);
    if (v >= 0) {
      return `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 + r}V${y0}Z`;
    }
    return `M${x0},${y0}V${y1 - r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 - r}V${y0}Z`;
  }
</script>

<div class="rtable" role="list" aria-label="Special colour rendering indices R1 to R14">
  {#each labels as text, i (i)}
    <div class="cell" class:r9={i === 8} role="listitem">
      <span class="k">R{i + 1}</span>
      <span class="v">{text}</span>
    </div>
  {/each}
</div>

<div class="chart" bind:clientWidth={cw}>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="R1 to R14 bar chart">
    {#each ticks as t (t)}
      <line class={t === 0 ? 'axisline' : 'gridline'} x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
      <text x={M.l - 6} y={sy(t) + 4} text-anchor="end">{t}</text>
    {/each}
    {#each values as v, i (i)}
      <path d={column(i, v)} class="bar" class:dim={hover !== null && hover !== i} />
      <text x={M.l + band * i + band / 2} y={H - 6} text-anchor="middle">R{i + 1}</text>
      <rect
        x={M.l + band * i}
        y={M.t}
        width={band}
        height={H - M.t - M.b}
        fill="transparent"
        role="presentation"
        onpointerenter={() => (hover = i)}
        onpointerleave={() => (hover = null)}
      />
    {/each}
  </svg>
  {#if hover !== null}
    <div class="tooltip" style:left="{((M.l + band * hover + band / 2) / W) * 100}%" style:top="{(Math.min(sy(values[hover]), sy(0)) / H) * 100}%">
      <strong>{labels[hover]}</strong> <span>R{hover + 1}</span>
    </div>
  {/if}
</div>

<style>
  .rtable {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin-bottom: 14px;
  }
  .cell {
    background: var(--surface-2);
    border-radius: 8px;
    padding: 6px 2px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cell.r9 {
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .k {
    font-size: 0.72rem;
    color: var(--text-3);
    font-weight: 600;
  }
  .v {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .bar {
    fill: var(--series-1);
    transition: opacity 0.15s;
  }
  .bar.dim {
    opacity: 0.45;
  }
  @media (max-width: 380px) {
    .v {
      font-size: 0.8rem;
    }
  }
</style>

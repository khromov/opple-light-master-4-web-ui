<script lang="ts">
  import { linear } from '../charts/scale';
  import { wavelengthToCss } from '../science/colour';
  import { LM4_WAVELENGTHS } from '../science/lm4';

  let { bands }: { bands: number[] } = $props();

  let cw = $state(0);
  const W = $derived(Math.max(260, cw || 360));
  const H = 170;
  const M = { l: 34, r: 8, t: 10, b: 36 };
  const sy = linear([0, 1], [H - M.b, M.t]);
  const band = $derived((W - M.l - M.r) / 8);
  const bw = $derived(Math.min(24, band * 0.6));
  const peak = $derived(Math.max(1e-9, ...bands));
  const rel = $derived(bands.map((b) => Math.max(0, b / peak)));
  let hover = $state<number | null>(null);

  function column(i: number, v: number): string {
    const x0 = M.l + band * i + (band - bw) / 2;
    const y0 = sy(0);
    const y1 = sy(v);
    const h = y0 - y1;
    if (h < 0.5) return '';
    const r = Math.min(4, h, bw / 2);
    return `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 + r}V${y0}Z`;
  }
</script>

<div class="chart" bind:clientWidth={cw}>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Relative sensor channel levels F1 to F8">
    {#each [0, 0.5, 1] as t (t)}
      <line class={t === 0 ? 'axisline' : 'gridline'} x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
      <text x={M.l - 6} y={sy(t) + 4} text-anchor="end">{t}</text>
    {/each}
    {#each rel as v, i (i)}
      <path d={column(i, v)} fill={wavelengthToCss(LM4_WAVELENGTHS[i])} class:dim={hover !== null && hover !== i} class="bar" />
      <text x={M.l + band * i + band / 2} y={H - M.b + 14} text-anchor="middle">F{i + 1}</text>
      <text x={M.l + band * i + band / 2} y={H - M.b + 27} text-anchor="middle" class="nm">{LM4_WAVELENGTHS[i]}</text>
      <rect x={M.l + band * i} y={M.t} width={band} height={H - M.t - M.b} fill="transparent" role="presentation" onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} />
    {/each}
  </svg>
  {#if hover !== null}
    <div class="tooltip" style:left="{((M.l + band * hover + band / 2) / W) * 100}%" style:top="{(sy(rel[hover]) / H) * 100}%">
      <strong>{rel[hover].toFixed(2)}</strong> <span>F{hover + 1} · {LM4_WAVELENGTHS[hover]} nm · {bands[hover].toFixed(0)}</span>
    </div>
  {/if}
</div>

<style>
  .bar {
    transition: opacity 0.15s;
  }
  .bar.dim {
    opacity: 0.45;
  }
  .chart text.nm {
    font-size: 9.5px;
  }
</style>

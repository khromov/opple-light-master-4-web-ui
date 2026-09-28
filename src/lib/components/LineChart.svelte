<script lang="ts">
  import { linear, niceMax, niceTicks } from '../charts/scale';

  let {
    xs,
    ys,
    xLabel,
    yLabel,
    fmtX = (v: number) => v.toFixed(1),
    fmtY = (v: number) => v.toFixed(0),
    marker = null,
    ariaLabel,
    height = 200,
  }: {
    xs: number[];
    ys: number[];
    xLabel: string;
    yLabel: string;
    fmtX?: (v: number) => string;
    fmtY?: (v: number) => string;
    marker?: number | null;
    ariaLabel: string;
    height?: number;
  } = $props();

  let cw = $state(0);
  const W = $derived(Math.max(260, cw || 360));
  const H = $derived(height);
  const M = { l: 42, r: 10, t: 12, b: 30 };

  const xMax = $derived(xs.length ? xs[xs.length - 1] : 1);
  const xMin = $derived(xs.length ? xs[0] : 0);
  const yTop = $derived(niceMax(Math.max(0, ...ys)));
  const sx = $derived(linear([xMin, xMax], [M.l, W - M.r]));
  const sy = $derived(linear([0, yTop], [H - M.b, M.t]));
  const xTicks = $derived(niceTicks(xMin, xMax, 6));
  const yTicks = $derived(niceTicks(0, yTop, 4));

  const line = $derived(ys.map((y, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`).join(''));
  const area = $derived(ys.length ? `${line}L${sx(xMax)},${sy(0)}L${sx(xMin)},${sy(0)}Z` : '');

  let hover = $state<number | null>(null);
  let svg: SVGSVGElement | undefined = $state();

  function onMove(e: PointerEvent) {
    if (!svg || !xs.length) return;
    const rect = svg.getBoundingClientRect();
    const x = sx.invert(((e.clientX - rect.left) / rect.width) * W);
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < x) lo = mid;
      else hi = mid;
    }
    hover = Math.abs(xs[lo] - x) < Math.abs(xs[hi] - x) ? lo : hi;
  }
</script>

<div class="chart" bind:clientWidth={cw}>
  <svg bind:this={svg} viewBox="0 0 {W} {H}" role="img" aria-label={ariaLabel} onpointermove={onMove} onpointerleave={() => (hover = null)}>
    {#each yTicks as t (t)}
      <line class={t === 0 ? 'axisline' : 'gridline'} x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
      <text x={M.l - 6} y={sy(t) + 4} text-anchor="end">{fmtY(t)}</text>
    {/each}
    {#each xTicks as t (t)}
      <text x={sx(t)} y={H - M.b + 15} text-anchor="middle">{fmtX(t)}</text>
    {/each}
    <text x={W - M.r} y={H - 2} text-anchor="end">{xLabel}</text>
    <text x={M.l + 4} y={M.t + 10}>{yLabel}</text>
    <path d={area} class="area" />
    <path d={line} class="line" />
    {#if marker !== null && marker >= 0 && marker < xs.length}
      <circle cx={sx(xs[marker])} cy={sy(ys[marker])} r="4.5" class="marker" />
    {/if}
    {#if hover !== null}
      <line class="axisline" x1={sx(xs[hover])} x2={sx(xs[hover])} y1={M.t} y2={H - M.b} />
      <circle cx={sx(xs[hover])} cy={sy(ys[hover])} r="4" class="marker" />
    {/if}
  </svg>
  {#if hover !== null}
    <div class="tooltip" style:left="{(sx(xs[hover]) / W) * 100}%" style:top="{(sy(ys[hover]) / H) * 100}%">
      <strong>{fmtY(ys[hover])}</strong> <span>{fmtX(xs[hover])}</span>
    </div>
  {/if}
</div>

<style>
  .line {
    fill: none;
    stroke: var(--series-1);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .area {
    fill: var(--series-1-wash);
  }
  .marker {
    fill: var(--series-1);
    stroke: var(--surface);
    stroke-width: 2;
  }
</style>

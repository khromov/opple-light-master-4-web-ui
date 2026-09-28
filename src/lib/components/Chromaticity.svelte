<script lang="ts">
  import { PLANCKIAN_LOCUS, PLANCK_TICKS, SPECTRAL_LOCUS, paintGamut, type XY } from '../science/cie-diagram';
  import { linear, niceTicks } from '../charts/scale';

  let { x, y, cct }: { x: number | null; y: number | null; cct: string } = $props();
  let zoom = $state(false);

  let cw = $state(0);
  const M = { l: 34, r: 10, t: 10, b: 28 };
  const view = $derived(zoom ? { x: [0.25, 0.55] as [number, number], y: [0.25, 0.47] as [number, number] } : { x: [0, 0.8] as [number, number], y: [0, 0.9] as [number, number] });
  // Equal scale on both axes so the diagram isn't distorted.
  const W = $derived(Math.max(260, Math.min(cw || 340, 480)));
  const H = $derived(Math.round(M.t + M.b + ((W - M.l - M.r) * (view.y[1] - view.y[0])) / (view.x[1] - view.x[0])));
  const sx = $derived(linear(view.x, [M.l, W - M.r]));
  const sy = $derived(linear(view.y, [H - M.b, M.t]));
  const xTicks = $derived(niceTicks(view.x[0], view.x[1], zoom ? 6 : 8));
  const yTicks = $derived(niceTicks(view.y[0], view.y[1], zoom ? 5 : 9));

  const path = (pts: XY[], close = false) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${sx(a).toFixed(1)},${sy(b).toFixed(1)}`).join('') + (close ? 'Z' : '');
  const labelled = [460, 480, 500, 520, 540, 560, 580, 600, 620];

  // The gamut is painted once at full extent; the zoomed view crops it via the image's position.
  let canvas: HTMLCanvasElement | undefined = $state();
  let gamutUrl = $state('');
  $effect(() => {
    if (!canvas || gamutUrl) return;
    paintGamut(canvas, 0.8, 0.9, 0.18);
    gamutUrl = canvas.toDataURL();
  });

  const hasPoint = $derived(x !== null && y !== null && x > 0 && y > 0);
  let hover = $state(false);
  const clipId = `cie-clip-${Math.random().toString(36).slice(2)}`;
</script>

<div bind:clientWidth={cw}>
<div class="chart" style:max-width="{W}px" style:margin="0 auto">
  <canvas bind:this={canvas} width="320" height="360" hidden></canvas>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="CIE 1931 chromaticity diagram{hasPoint ? `, measured x ${x!.toFixed(4)}, y ${y!.toFixed(4)}` : ''}">
    <defs>
      <clipPath id={clipId}><rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} /></clipPath>
    </defs>
    {#each xTicks as t (t)}
      <line class="gridline" x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} />
      <text x={sx(t)} y={H - M.b + 16} text-anchor="middle">{t.toFixed(zoom ? 2 : 1)}</text>
    {/each}
    {#each yTicks as t (t)}
      <line class="gridline" x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
      <text x={M.l - 6} y={sy(t) + 4} text-anchor="end">{t.toFixed(zoom ? 2 : 1)}</text>
    {/each}
    <g clip-path="url(#{clipId})">
      {#if gamutUrl}
        <image href={gamutUrl} x={sx(0)} y={sy(0.9)} width={sx(0.8) - sx(0)} height={sy(0) - sy(0.9)} preserveAspectRatio="none" opacity="0.9" />
      {/if}
      <path d={path(SPECTRAL_LOCUS.map((p) => p.xy), true)} class="locus" />
      <path d={path(PLANCKIAN_LOCUS)} class="planck" />
      {#each PLANCK_TICKS as tk (tk.k)}
        <circle cx={sx(tk.xy[0])} cy={sy(tk.xy[1])} r="2" class="planck-dot" />
        {#if zoom || tk.k === 2000 || tk.k === 4000 || tk.k === 10000}
          <text x={sx(tk.xy[0]) + 3} y={sy(tk.xy[1]) + 13} class="planck-label">{tk.k}K</text>
        {/if}
      {/each}
      {#if !zoom}
        {#each SPECTRAL_LOCUS.filter((p) => labelled.includes(p.nm)) as p (p.nm)}
          {@const left = p.nm < 520}
          <text x={sx(p.xy[0]) + (left ? -5 : 5)} y={sy(p.xy[1]) + 4} text-anchor={left ? 'end' : 'start'} class="nm">{p.nm}</text>
        {/each}
      {/if}
      {#if hasPoint}
        <circle
          cx={sx(x!)}
          cy={sy(y!)}
          r="6"
          class="point"
          role="img"
          aria-label="Measured chromaticity"
          onpointerenter={() => (hover = true)}
          onpointerleave={() => (hover = false)}
        />
        <circle cx={sx(x!)} cy={sy(y!)} r="14" fill="transparent" onpointerenter={() => (hover = true)} onpointerleave={() => (hover = false)} role="presentation" />
      {/if}
    </g>
    <line class="axisline" x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
    <line class="axisline" x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} />
    <text x={W - M.r} y={H - 2} text-anchor="end" class="axis-name">x</text>
    <text x={M.l - 24} y={M.t + 8} class="axis-name">y</text>
  </svg>
  {#if hover && hasPoint}
    <div class="tooltip" style:left="{(sx(x!) / W) * 100}%" style:top="{(sy(y!) / H) * 100}%">
      <strong>x {x!.toFixed(4)} · y {y!.toFixed(4)}</strong><br /><span>CCT {cct} K</span>
    </div>
  {/if}
  <button class="btn small zoom no-print" onclick={() => (zoom = !zoom)}>{zoom ? 'Full diagram' : 'Zoom to white'}</button>
</div>
</div>

<style>
  .locus {
    fill: none;
    stroke: var(--text-3);
    stroke-width: 1;
  }
  .planck {
    fill: none;
    stroke: #1b1e24;
    stroke-width: 1.5;
    opacity: 0.75;
  }
  .planck-dot {
    fill: #1b1e24;
    opacity: 0.8;
  }
  .chart text.planck-label {
    fill: #1b1e24;
    font-size: 9.5px;
    opacity: 0.85;
  }
  .chart text.nm {
    font-size: 9.5px;
  }
  .chart text.axis-name {
    font-style: italic;
    font-size: 12px;
  }
  .point {
    fill: #111318;
    stroke: #fff;
    stroke-width: 2;
  }
  .zoom {
    position: absolute;
    top: 14px;
    right: 14px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
  }
</style>

<script lang="ts">
  import { cctToCss } from '../science/colour';

  let { lux, cct, cctText, luxText, live }: { lux: number | null; cct: number | null; cctText: string; luxText: string; live: boolean } = $props();

  const W = 280;
  const H = 200;
  const cx = W / 2;
  const cy = 132;
  const r = 100;
  const LO = 1; // log10(10 lx)
  const HI = Math.log10(50000);
  const SWEEP = 240;

  const t = $derived(lux && lux > 0 ? Math.min(1, Math.max(0, (Math.log10(Math.max(lux, 10)) - LO) / (HI - LO))) : 0);

  function point(frac: number, radius = r): [number, number] {
    const a = ((-SWEEP / 2 + frac * SWEEP) * Math.PI) / 180;
    return [cx + radius * Math.sin(a), cy - radius * Math.cos(a)];
  }

  function arc(from: number, to: number): string {
    const [x0, y0] = point(from);
    const [x1, y1] = point(to);
    const large = (to - from) * SWEEP > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }

  const ticks = [10, 100, 1000, 10000, 50000].map((v) => ({ v, f: (Math.log10(v) - LO) / (HI - LO) }));
  const label = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));
  const swatch = $derived(cct && cct >= 1000 ? cctToCss(cct) : null);
</script>

<div class="gauge">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Illuminance {luxText} lux, colour temperature {cctText} kelvin">
    <path d={arc(0, 1)} class="track" />
    {#if t > 0.001}
      <path d={arc(0, t)} class="fill" class:live />
    {/if}
    {#each ticks as tk (tk.v)}
      {@const [x0, y0] = point(tk.f, r + 8)}
      {@const [x1, y1] = point(tk.f, r + 13)}
      {@const [lx, ly] = point(tk.f, r + 24)}
      <line x1={x0} y1={y0} x2={x1} y2={y1} class="tick" />
      <text x={lx} y={ly + 4} text-anchor="middle">{label(tk.v)}</text>
    {/each}
  </svg>
  <div class="center">
    <div class="label">Illuminance</div>
    <div class="value" class:placeholder={luxText === '---'}>{luxText}{#if luxText !== '---'}<span class="u">lx</span>{/if}</div>
    <div class="cct">
      {#if swatch}<span class="dot" style:background={swatch}></span>{/if}
      <span class="num" class:placeholder={cctText === '---'}>{cctText}</span> <span class="k">K</span>
    </div>
  </div>
</div>

<style>
  .gauge {
    position: relative;
    max-width: 320px;
    margin: 0 auto;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .track {
    fill: none;
    stroke: var(--accent-bg);
    stroke-width: 12;
    stroke-linecap: round;
  }
  .fill {
    fill: none;
    stroke: var(--accent);
    stroke-width: 12;
    stroke-linecap: round;
    transition: d 0.35s ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
  .tick {
    stroke: var(--axis);
    stroke-width: 1.5;
  }
  text {
    fill: var(--text-3);
    font-size: 10px;
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 22px;
    pointer-events: none;
  }
  .label {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-2);
  }
  .value {
    display: flex;
    align-items: baseline;
    font-size: 3.4rem;
    font-weight: 650;
    line-height: 1.05;
    color: var(--text);
    letter-spacing: -0.02em;
    /* Updates every 480 ms while live: fixed-width digits keep it from jittering. */
    font-variant-numeric: tabular-nums;
  }
  .value.placeholder {
    color: var(--text-3);
    font-weight: 500;
  }
  .u {
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--text-3);
    margin-left: 4px;
  }
  .cct {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
  }
  .cct .k {
    color: var(--text-3);
    font-weight: 500;
  }
  .cct .placeholder {
    color: var(--text-3);
    font-weight: 500;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--border);
  }
</style>

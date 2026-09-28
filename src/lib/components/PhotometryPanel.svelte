<script lang="ts">
  import Info from '@lucide/svelte/icons/info';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import type { Reading } from '../ble/meter';
  import { formatPhotometry } from '../format';
  import LuxGauge from './LuxGauge.svelte';
  import Chromaticity from './Chromaticity.svelte';
  import RChart from './RChart.svelte';
  import ChannelChart from './ChannelChart.svelte';
  import Modal from './Modal.svelte';

  let { reading, live = false, canStart = false }: { reading: Reading | null; live?: boolean; /** show the "press Start" hint (Measure screen with Web Bluetooth) */ canStart?: boolean } = $props();

  const view = $derived(formatPhotometry(reading));

  const HELP = {
    ra: {
      title: 'Ra: colour rendering index',
      body: 'The capability of an object to restore colours under a light source. The higher the value, the more realistic the colours are to the human eye (compared to sunlight).',
    },
    cs: {
      title: 'CS: circadian stimulus',
      body: 'The degree to which the light stimulates the melanopsin cells. The higher the value, the greater the inhibition of melatonin secretion, and the more alert and nervous people are.',
    },
    eml: {
      title: 'EML: equivalent melanopic lux',
      body: 'The equivalent illuminance of light on melanopsin cells under the same illuminance. When EML is high, people are more alert and concentrated; when EML is low, people tend to relax.',
    },
    r9: {
      title: 'R9: strong red',
      body: 'How faithfully a saturated red test colour is rendered. The higher the value, the more realistic reds look compared to the reference light. Many LEDs score low here even with a good Ra.',
    },
  } as const;
  type HelpKey = keyof typeof HELP;
  let help = $state<HelpKey | null>(null);
  let helpOpen = $state(false);
  const openHelp = (k: HelpKey) => {
    help = k;
    helpOpen = true;
  };

  const metrics = $derived([
    { key: 'ra' as const, label: 'CRI (Ra)', value: view.ra },
    { key: 'cs' as const, label: 'CS', value: view.cs },
    { key: 'eml' as const, label: 'EML', value: view.eml },
    { key: 'r9' as const, label: 'R9', value: view.r9 },
  ]);

  const coords = $derived([
    { k: 'x', v: view.x },
    { k: 'y', v: view.y },
    { k: 'u', v: view.u },
    { k: 'v', v: view.v },
    { k: 'Duv', v: view.duv },
  ]);

  let showExtras = $state(false);
  let cieZoom = $state(false);
  const extrasId = `extras-${Math.random().toString(36).slice(2)}`;
  const isNone = (v: string) => v === '---' || v === '--';
</script>

<section class="card gauge-card">
  {#if live}<span class="live-pill no-print"><i></i>Live</span>{/if}
  <LuxGauge lux={reading?.lux ?? null} cct={view.cct !== '---' ? (reading?.cct ?? null) : null} luxText={view.lux} cctText={view.cct} {live} />
  {#if !reading}
    {#if live || canStart}
      <p class="hint no-print">{live ? 'Waiting for the first reading…' : 'Face the sensor towards the light, then press Start.'}</p>
    {/if}
  {:else if !view.valid}
    <p class="range">
      <TriangleAlert size={16} />
      <span>
        {reading.lux >= 50000
          ? 'Maximum value exceeded: increase the distance between the Light Master and the luminaire.'
          : 'Too dark to measure: the meter needs at least 10 lx.'}
      </span>
    </p>
  {/if}
  <dl class="coords">
    {#each coords as c (c.k)}
      <div><dt>{c.k}</dt><dd class="num" class:placeholder={isNone(c.v)}>{c.v}</dd></div>
    {/each}
  </dl>
</section>

<section class="card metrics">
  {#each metrics as m (m.key)}
    <div class="metric">
      <div class="mlabel">{m.label}</div>
      <button class="icon-btn help" aria-label="What is {m.label}?" onclick={() => openHelp(m.key)}><Info size={16} /></button>
      <div class="mvalue num" class:placeholder={isNone(m.value)}>{m.value}</div>
    </div>
  {/each}
</section>

<section class="card">
  <h3 class="card-title">Colour rendering R1–R14</h3>
  <RChart values={view.rBars} labels={view.rs} empty={!view.valid} />
</section>

<section class="card">
  <h3 class="card-title">
    CIE 1931 chromaticity
    <button class="btn small zoom no-print" onclick={() => (cieZoom = !cieZoom)}>{cieZoom ? 'Full diagram' : 'Zoom to white'}</button>
  </h3>
  <Chromaticity x={view.valid ? (reading?.x ?? null) : null} y={view.valid ? (reading?.y ?? null) : null} cct={view.cct} bind:zoom={cieZoom} />
</section>

{#if reading}
  <section class="card extras">
    <button class="disclosure" aria-expanded={showExtras} aria-controls={extrasId} onclick={() => (showExtras = !showExtras)}>
      <span class="card-title">More readings</span>
      <span class="badge-extra" title="Not in the Opple app">Extra</span>
      <ChevronDown class="chev" size={20} />
    </button>
    {#if showExtras}
      <div id={extrasId}>
      <p class="muted small note">Extra readings from the same measurement. The Opple app doesn't show these.</p>
      <h4>Sensor channels</h4>
      <p class="muted small">
        Calibrated counts of the eight spectral channels, relative to the strongest. The channels differ in sensitivity, so this is a fingerprint of
        the light, not its spectrum.
      </p>
      <ChannelChart bands={reading.bands} />
      <dl class="extra-grid">
        <div><dt>u′ (CIE 1976)</dt><dd class="num">{reading.up.toFixed(4)}</dd></div>
        <div><dt>v′ (CIE 1976)</dt><dd class="num">{reading.vp.toFixed(4)}</dd></div>
        <div><dt>Tint (DNG)</dt><dd class="num">{Number.isFinite(reading.tint) ? reading.tint.toFixed(1) : '---'}</dd></div>
        <div><dt>Illuminance</dt><dd class="num">{reading.lux.toFixed(1)} lx</dd></div>
        <div><dt>Battery</dt><dd class="num">{reading.battery.percent !== null ? `${reading.battery.percent} %` : '---'}</dd></div>
        <div><dt>Calibration</dt><dd>{reading.calibrated ? 'Factory kSensor applied' : 'Not read (raw counts)'}</dd></div>
      </dl>
      <h4>Raw sensor counts</h4>
      <div class="raw num">
        {#each reading.raw as v, i (i)}
          <span><em>{i < 8 ? `F${i + 1}` : 'Clear'}</em>{v}</span>
        {/each}
        <span title="An extra word in the measurement frame that the Opple app ignores; it tracks light level and is probably the sensor's near-infrared channel."
          ><em>NIR?</em>{reading.aux ?? '---'}</span
        >
      </div>
      </div>
    {/if}
  </section>
{/if}

<Modal bind:open={helpOpen} title={help ? HELP[help].title : ''} variant="sheet">
  {#if help}
    {@const current = metrics.find((m) => m.key === help)?.value}
    {#if reading && current && !isNone(current)}
      <div class="help-value num">{current}<small>this reading</small></div>
    {/if}
    <p>{HELP[help].body}</p>
  {/if}
</Modal>

<style>
  section + section {
    margin-top: 12px;
  }
  .gauge-card {
    position: relative;
    padding-top: 8px;
  }
  .live-pill {
    position: absolute;
    top: 12px;
    left: 14px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-2);
    background: var(--accent-bg);
    padding: 4px 9px 4px 8px;
    border-radius: 999px;
  }
  .live-pill i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .live-pill i {
      animation: none;
    }
  }
  .hint {
    text-align: center;
    color: var(--text-2);
    font-size: 0.85rem;
    max-width: 32ch;
    margin: 8px auto 14px;
  }
  .range {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--text);
    font-size: 0.88rem;
    background: color-mix(in srgb, var(--warn) 12%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
    border-radius: 10px;
    padding: 8px 12px;
    margin: 12px 0;
  }
  .range :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--warn-text);
  }
  .coords {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    margin: 4px 0 0;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .coords div {
    text-align: center;
  }
  dt {
    font-size: 0.75rem;
    color: var(--text-3);
    font-weight: 600;
  }
  dd {
    margin: 2px 0 0;
    font-weight: 600;
    font-size: 0.95rem;
  }
  /* CRI (Ra), CS, EML, R9: one card, cells split by hairlines (1×4, 2×2 on phones). */
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 0;
    overflow: hidden;
  }
  .metric {
    position: relative;
    padding: 12px 14px 14px;
  }
  .metric + .metric {
    border-left: 1px solid var(--border);
  }
  .mlabel {
    min-height: 20px;
    padding-right: 30px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-2);
  }
  .help {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 40px;
    height: 40px;
    color: var(--text-3);
  }
  .mvalue {
    font-size: 1.4rem;
    font-weight: 650;
    line-height: 1.2;
  }
  .mvalue.placeholder {
    font-weight: 500;
  }
  .help-value {
    font-size: 2rem;
    font-weight: 650;
    color: var(--text);
    margin: 0 0 8px;
  }
  .help-value small {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-3);
    margin-left: 6px;
  }
  .zoom {
    min-height: 32px;
    margin: -6px 0;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
  }
  .extras .note {
    margin: 12px 0 0;
  }
  .small {
    font-size: 0.82rem;
  }
  h4 {
    margin: 16px 0 4px;
    font-size: 0.92rem;
  }
  .extras p {
    margin: 0 0 8px;
  }
  .extra-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px 16px;
    margin: 14px 0 0;
  }
  .raw {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 6px;
    font-size: 0.85rem;
  }
  .raw span {
    background: var(--surface-2);
    border-radius: 8px;
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
  }
  .raw em {
    font-style: normal;
    color: var(--text-3);
    font-size: 0.72rem;
    font-weight: 600;
  }
  @media (max-width: 560px) {
    .metrics {
      grid-template-columns: repeat(2, 1fr);
    }
    .metric {
      padding: 9px 14px 10px;
    }
    .metric + .metric {
      border-left: 0;
    }
    .metric:nth-child(2n) {
      border-left: 1px solid var(--border);
    }
    .metric:nth-child(-n + 2) {
      border-bottom: 1px solid var(--border);
    }
    .coords dd {
      font-size: 0.82rem;
    }
  }
</style>

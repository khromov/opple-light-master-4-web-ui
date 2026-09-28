<script lang="ts">
  import Info from '@lucide/svelte/icons/info';
  import type { Reading } from '../ble/meter';
  import { formatPhotometry } from '../format';
  import LuxGauge from './LuxGauge.svelte';
  import Chromaticity from './Chromaticity.svelte';
  import RChart from './RChart.svelte';
  import ChannelChart from './ChannelChart.svelte';
  import Modal from './Modal.svelte';

  let { reading, live = false }: { reading: Reading | null; live?: boolean } = $props();

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
</script>

<section class="card gauge-card">
  <LuxGauge lux={reading?.lux ?? null} cct={view.cct !== '---' ? (reading?.cct ?? null) : null} luxText={view.lux} cctText={view.cct} {live} />
  {#if reading && !view.valid}
    <p class="range">
      {reading.lux >= 50000
        ? 'Maximum value exceeded: increase the distance between the Light Master and the luminaire.'
        : 'Too dark to measure: the meter needs at least 10 lx.'}
    </p>
  {/if}
  <dl class="coords">
    {#each coords as c (c.k)}
      <div><dt>{c.k}</dt><dd class="num">{c.v}</dd></div>
    {/each}
  </dl>
</section>

<section class="metrics">
  {#each metrics as m (m.key)}
    <div class="card metric">
      <div class="mlabel">
        {m.label}
        <button class="icon-btn help" aria-label="What is {m.label}?" onclick={() => openHelp(m.key)}><Info size={15} /></button>
      </div>
      <div class="mvalue">{m.value}</div>
    </div>
  {/each}
</section>

<section class="card">
  <h3 class="card-title">Colour rendering R1–R14</h3>
  <RChart values={view.rBars} labels={view.rs} />
</section>

<section class="card">
  <h3 class="card-title">CIE 1931 chromaticity</h3>
  <Chromaticity x={view.valid ? (reading?.x ?? null) : null} y={view.valid ? (reading?.y ?? null) : null} cct={view.cct} />
</section>

{#if reading}
  <section class="card extras">
    <button class="extras-toggle" aria-expanded={showExtras} onclick={() => (showExtras = !showExtras)}>
      <span class="card-title" style="margin:0">More readings</span>
      <span class="muted small">{showExtras ? 'Hide' : 'Show'} · not in the Opple app</span>
    </button>
    {#if showExtras}
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
    {/if}
  </section>
{/if}

<Modal bind:open={helpOpen} title={help ? HELP[help].title : ''}>
  {#if help}<p>{HELP[help].body}</p>{/if}
</Modal>

<style>
  section + section {
    margin-top: 12px;
  }
  .gauge-card {
    padding-top: 8px;
  }
  .range {
    text-align: center;
    color: var(--warn);
    font-size: 0.88rem;
    margin: 0 0 8px;
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
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 12px;
  }
  .metric {
    padding: 10px 12px 12px;
  }
  .mlabel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-3);
  }
  .help {
    width: 26px;
    height: 26px;
    margin: -4px -6px -4px 0;
  }
  .mvalue {
    font-size: 1.55rem;
    font-weight: 650;
    margin-top: 2px;
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
    .coords dd {
      font-size: 0.82rem;
    }
  }
</style>

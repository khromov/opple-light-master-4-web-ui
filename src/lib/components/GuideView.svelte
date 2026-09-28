<script lang="ts">
  import Bluetooth from '@lucide/svelte/icons/bluetooth';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { app } from '../state.svelte';
  import { router } from '../router.svelte';

  let step = $state<1 | 2>(1);
  let working = $state(false);
  // Tips stay out of the way until a connection attempt here fails.
  let tipsOpen = $state(false);

  async function connect(showAll = false) {
    working = true;
    const ok = await app.connect(showAll);
    working = false;
    if (ok) step = 2;
    else if (app.error) tipsOpen = true; // a dismissed chooser leaves no error
  }

  async function retry() {
    // As the app's "No, retry": drop this meter and forget it, so the next Connect starts fresh.
    await app.forceRelease();
    step = 1;
  }

  const unsupported = $derived(!app.support.ok);
</script>

<section class="card">
  <h2>{app.connected ? 'Switch Light Master' : 'Add Light Master'}</h2>
  {#if unsupported}
    <p class="warn">
      {app.support.ok ? '' : app.support.reason === 'insecure' ? 'Web Bluetooth needs an https page.' : 'This browser has no Web Bluetooth.'}
      Use Chrome or Edge on desktop or Android. On iPhone and iPad, use a Web Bluetooth browser such as Bluefy.
    </p>
  {:else if step === 1}
    <ol class="steps">
      <li>
        <strong>Wake the meter.</strong> Push the inner part out by pushing the bottom of the device. The indicator LED should flash slowly. If it
        doesn't, charge the meter.
      </li>
      <li><strong>Close the Opple app</strong> (and any other page using the meter). It accepts one connection at a time.</li>
      <li><strong>Keep it close</strong> to this device, then press Connect and pick <em>SigMesh</em> (that's how the Light Master 4 names itself).</li>
    </ol>
    <div class="row">
      <button class="btn primary wide" class:busy={working || app.busy} onclick={() => connect()} disabled={working || app.busy}>
        {#if working || app.busy}<span class="spinner"></span> Connecting…{:else}<Bluetooth size={16} /> Connect{/if}
      </button>
      <button class="btn text wide" onclick={() => connect(true)} disabled={working || app.busy}>Not listed? Show all devices</button>
    </div>
  {:else}
    <p class="big">Check if the LED indicator is constantly on.</p>
    <p class="muted">A steady LED means the meter is connected to this page.</p>
    <div class="row">
      <button class="btn" onclick={retry}>No, retry</button>
      <button class="btn primary" onclick={() => router.go('')}>Yes, continue</button>
    </div>
  {/if}
</section>

<section class="card tips">
  <button class="disclosure" aria-expanded={tipsOpen} aria-controls="guide-tips" onclick={() => (tipsOpen = !tipsOpen)}>
    <span class="card-title">Trouble connecting?</span>
    <ChevronDown class="chev" size={20} />
  </button>
  <ul id="guide-tips" hidden={!tipsOpen}>
    <li>The meter stops advertising while anything is connected to it. Quit the Opple app completely, and close other tabs using it.</li>
    <li>
      If a connection seems stuck, use <a href="#/diagnostics">Diagnostics → Force disconnect</a>. A link held by another browser tab or app can
      only be released there: quit the browser fully, or restart the meter.
    </li>
    <li>On Linux or older Chrome builds, enable <code>chrome://flags/#enable-experimental-web-platform-features</code>.</li>
  </ul>
</section>

<style>
  h2 {
    font-size: 1.2rem;
    margin-bottom: 10px;
  }
  .steps {
    list-style: none;
    padding: 0;
    margin: 0 0 18px;
    counter-reset: step;
    display: grid;
    gap: 14px;
    color: var(--text-2);
  }
  .steps li {
    counter-increment: step;
    position: relative;
    padding-left: 38px;
  }
  .steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: -1px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.85rem;
    background: var(--accent-bg);
    color: var(--text);
  }
  .steps strong {
    color: var(--text);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .row .wide {
    flex: 1 1 100%;
  }
  .row .primary {
    min-height: 48px;
  }
  .big {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .warn {
    color: var(--warn-text);
  }
  .tips {
    margin-top: 12px;
  }
  .tips ul {
    margin: 22px 0 0;
    padding-left: 18px;
    display: grid;
    gap: 8px;
    color: var(--text-2);
    font-size: 0.9rem;
  }
  .tips ul[hidden] {
    display: none;
  }

</style>

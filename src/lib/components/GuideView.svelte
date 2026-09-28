<script lang="ts">
  import Bluetooth from '@lucide/svelte/icons/bluetooth';
  import { app } from '../state.svelte';
  import { router } from '../router.svelte';

  let step = $state<1 | 2>(1);
  let working = $state(false);

  async function connect(showAll = false) {
    working = true;
    const ok = await app.connect(showAll);
    working = false;
    if (ok) step = 2;
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
      <button class="btn primary" onclick={() => connect()} disabled={working || app.busy}>
        {#if working || app.busy}<span class="spinner"></span> Connecting…{:else}<Bluetooth size={16} /> Connect{/if}
      </button>
      <button class="btn" onclick={() => connect(true)} disabled={working || app.busy}>Not listed? Show all devices</button>
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
  <h3 class="card-title">Trouble connecting?</h3>
  <ul>
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
    padding-left: 20px;
    margin: 0 0 16px;
    display: grid;
    gap: 10px;
    color: var(--text-2);
  }
  .steps strong {
    color: var(--text);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .big {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .warn {
    color: var(--warn);
  }
  .tips {
    margin-top: 12px;
  }
  .tips ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 8px;
    color: var(--text-2);
    font-size: 0.9rem;
  }
  code {
    font-size: 0.82rem;
    word-break: break-all;
  }
</style>

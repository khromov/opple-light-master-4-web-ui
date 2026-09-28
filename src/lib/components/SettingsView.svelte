<script lang="ts">
  import { app, type Theme } from '../state.svelte';
  import Segmented from './Segmented.svelte';

  let theme = $state<Theme>(app.theme);
  $effect(() => {
    if (theme !== app.theme) app.setTheme(theme);
  });
</script>

<section class="card">
  <h3 class="card-title">Appearance</h3>
  <Segmented
    bind:value={theme}
    label="Theme"
    options={[
      { value: 'auto', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ]}
  />
</section>

<section class="card">
  <h3 class="card-title">About</h3>
  <p>
    A web version of the Light Master screens in the OPPLE Smart app, for the Opple Light Master 4. It talks to the meter directly over Web Bluetooth;
    nothing is sent anywhere, and reports stay in this browser.
  </p>
  <p>
    The colour maths (XYZ matrix, CRI R1–R14/Ra, EML and CS regressions) and the flicker analysis follow the official app's own algorithms and
    coefficients (<code>LightmasterIVCoeff_20231115</code>), so results should match it. CRI from eight bands is an estimate, not a
    spectroradiometer result.
  </p>
  <h4>Credits</h4>
  <ul>
    <li><a href="https://github.com/natmart-in/sunday-light-meter" target="_blank" rel="noopener">sunday-light-meter</a> (MIT) — Web Bluetooth session handling and the verified LM4 pipeline.</li>
    <li><a href="https://github.com/gabrielebaudo/opple-bridge" target="_blank" rel="noopener">opple-bridge</a> (MIT) — LM4 flicker protocol and model coefficients.</li>
    <li>Colour science: McCamy (CCT), Ohno 2014 (Duv), CIE 13.3 (CRI), Rea et al. (CS).</li>
  </ul>
  <p class="muted small">Not affiliated with Opple. Opple and Light Master are trademarks of their owner.</p>
</section>

<style>
  section + section {
    margin-top: 12px;
  }
  p {
    color: var(--text-2);
  }
  h4 {
    margin: 14px 0 6px;
  }
  ul {
    padding-left: 18px;
    color: var(--text-2);
    display: grid;
    gap: 6px;
  }
  a {
    color: var(--info);
  }
  .small {
    font-size: 0.82rem;
  }
</style>

<script lang="ts">
  import Bluetooth from '@lucide/svelte/icons/bluetooth';
  import BluetoothConnected from '@lucide/svelte/icons/bluetooth-connected';
  import BluetoothOff from '@lucide/svelte/icons/bluetooth-off';
  import BatteryFull from '@lucide/svelte/icons/battery-full';
  import BatteryMedium from '@lucide/svelte/icons/battery-medium';
  import BatteryLow from '@lucide/svelte/icons/battery-low';
  import BatteryWarning from '@lucide/svelte/icons/battery-warning';
  import Menu from '@lucide/svelte/icons/menu';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import X from '@lucide/svelte/icons/x';
  import { app } from './lib/state.svelte';
  import { router } from './lib/router.svelte';
  import MeasureView from './lib/components/MeasureView.svelte';
  import ReportsView from './lib/components/ReportsView.svelte';
  import ReportView from './lib/components/ReportView.svelte';
  import GuideView from './lib/components/GuideView.svelte';
  import DiagnosticsView from './lib/components/DiagnosticsView.svelte';
  import SettingsView from './lib/components/SettingsView.svelte';

  const route = $derived(router.route);
  const isHome = $derived(route.name === 'photometry' || route.name === 'flicker');
  const TITLES: Record<string, string> = {
    reports: 'Report List',
    report: 'Test Report',
    shared: 'Test Report',
    guide: 'Light Master',
    diagnostics: 'Diagnostics',
    settings: 'Settings & about',
  };
  const title = $derived(isHome ? 'Light Master' : TITLES[route.name]);

  let menuOpen = $state(false);
  const battery = $derived(app.reading?.battery.percent ?? null);

  function go(path: string) {
    menuOpen = false;
    router.go(path);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') menuOpen = false;
  }
</script>

<svelte:window onkeydown={onKey} />

<header class="top no-print">
  <div class="inner">
    {#if isHome}
      <img class="logo" src="{import.meta.env.BASE_URL}favicon.svg" alt="" width="28" height="28" />
    {:else}
      <button class="icon-btn" aria-label="Back" onclick={() => router.back()}><ChevronLeft size={22} /></button>
    {/if}
    <h1>{title}</h1>
    <span class="spacer"></span>
    {#if app.connected && battery !== null}
      <span class="chip" title="Battery">
        {#if battery > 70}<BatteryFull size={17} />{:else if battery > 35}<BatteryMedium size={17} />{:else if battery > 15}<BatteryLow size={17} />{:else}<BatteryWarning size={17} />{/if}
        {battery}%
      </span>
    {/if}
    <button class="chip conn" class:on={app.connected} onclick={() => go('guide')} title={app.message || 'Connection'}>
      {#if app.connected}<BluetoothConnected size={17} /><span class="label">Connected</span>
      {:else if app.busy}<span class="spinner"></span><span class="label">Connecting</span>
      {:else if app.support.ok}<Bluetooth size={17} /><span class="label">No connection</span>
      {:else}<BluetoothOff size={17} /><span class="label">Unsupported</span>{/if}
    </button>
    <button class="icon-btn" aria-label="Menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}><Menu size={20} /></button>
  </div>
  {#if menuOpen}
    <nav class="menu" aria-label="Main">
      <a href="#/" onclick={() => (menuOpen = false)}>Measure</a>
      <a href="#/reports" onclick={() => (menuOpen = false)}>Report List</a>
      <a href="#/guide" onclick={() => (menuOpen = false)}>{app.connected ? 'Switch device' : 'Add Light Master'}</a>
      {#if app.connected}<button onclick={() => ((menuOpen = false), app.disconnect())}>Disconnect</button>{/if}
      <a href="#/diagnostics" onclick={() => (menuOpen = false)}>Diagnostics</a>
      <a href="#/settings" onclick={() => (menuOpen = false)}>Settings &amp; about</a>
    </nav>
    <button class="scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
  {/if}
</header>

<main>
  {#if !app.support.ok && isHome}
    <div class="banner warn no-print">
      {app.support.reason === 'insecure' ? 'Web Bluetooth needs an https page.' : 'This browser has no Web Bluetooth.'} Use Chrome or Edge on desktop or
      Android; on iPhone/iPad use a Web Bluetooth browser such as Bluefy. Saved reports still work.
    </div>
  {/if}
  {#if app.error}
    <div class="banner error no-print" role="alert">
      <span>{app.error}</span>
      <button class="icon-btn" aria-label="Dismiss" onclick={() => (app.error = null)}><X size={16} /></button>
    </div>
  {/if}
  {#if app.state === 'reconnecting' || app.state === 'warning'}
    <div class="banner warn no-print">{app.message}</div>
  {/if}

  {#if route.name === 'photometry' || route.name === 'flicker'}
    <MeasureView tab={route.name} />
  {:else if route.name === 'reports'}
    <ReportsView />
  {:else if route.name === 'report'}
    <ReportView id={route.id} />
  {:else if route.name === 'shared'}
    <ReportView code={route.code} />
  {:else if route.name === 'guide'}
    <GuideView />
  {:else if route.name === 'diagnostics'}
    <DiagnosticsView />
  {:else if route.name === 'settings'}
    <SettingsView />
  {/if}
</main>

{#if app.toast}
  <div class="toast" role="status">{app.toast}</div>
{/if}

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }
  .inner {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    min-height: 56px;
  }
  .logo {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    flex: none;
  }
  h1 {
    font-size: 1.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 0 1 auto;
  }
  .spacer {
    flex: 1;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-2);
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-variant-numeric: tabular-nums;
  }
  .conn {
    cursor: pointer;
  }
  .conn.on {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 40%, var(--border));
  }
  .menu {
    position: absolute;
    right: max(16px, calc((100vw - 760px) / 2 + 16px));
    top: 58px;
    z-index: 2;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    min-width: 210px;
    padding: 6px;
  }
  .menu a,
  .menu button {
    text-align: left;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--text);
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
  }
  .menu a:hover,
  .menu button:hover {
    background: var(--surface-2);
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    z-index: 1;
    cursor: default;
  }
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 16px 16px 8px;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-radius: 12px;
    padding: 10px 14px;
    margin-bottom: 12px;
    font-size: 0.9rem;
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .banner.error {
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
    color: var(--bad);
  }
  .banner.warn {
    border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 90px;
    transform: translateX(-50%);
    background: var(--text);
    color: var(--bg);
    padding: 10px 16px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.9rem;
    z-index: 50;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  @media (max-width: 480px) {
    .chip .label {
      display: none;
    }
  }
  @media print {
    main {
      max-width: none;
    }
  }
</style>

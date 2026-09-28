// Application state: one Light Master session shared by every view.

import { LightMaster, advertisingState, bluetoothSupport, permittedDevices, releasePermittedDevices, type LogEntry, type MeterState, type Reading } from './ble/meter';
import type { FlickerResult } from './science/flicker';

/** The app polls every 480 ms while Photometry is running. */
export const POLL_MS = 480;
const MAX_LOG = 600;

const prefs = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`lm4:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(`lm4:${key}`);
      else localStorage.setItem(`lm4:${key}`, value);
    } catch {
      // storage unavailable: preferences just don't persist
    }
  },
};

export type Theme = 'auto' | 'light' | 'dark';

// Dev server only: mirror the log to the terminal side (see vite.config.ts).
let devQueue: string[] = [];
let devTimer: ReturnType<typeof setTimeout> | null = null;
let devChain: Promise<unknown> = Promise.resolve();
function devLog(entry: LogEntry) {
  devQueue.push(`${new Date(entry.ts).toISOString()} ${entry.level.toUpperCase()} ${entry.message}`);
  if (devTimer) return;
  devTimer = setTimeout(() => {
    const body = devQueue.join('\n');
    devQueue = [];
    devTimer = null;
    // One request at a time so lines reach the file in order.
    devChain = devChain.then(() => fetch('/__log', { method: 'POST', body }).catch(() => {}));
  }, 250);
}

class AppState {
  readonly meter: LightMaster;
  support = bluetoothSupport();
  state = $state<MeterState>('idle');
  message = $state('');
  deviceName = $state<string | null>(null);
  reading = $state.raw<Reading | null>(null);
  live = $state(false);
  flicker = $state.raw<FlickerResult | null>(null);
  flickerBusy = $state(false);
  saving = $state(false);
  error = $state<string | null>(null);
  logs = $state.raw<LogEntry[]>([]);
  knownDevice = $state<{ name: string; id: string } | null>(null);
  theme = $state<Theme>((prefs.get('theme') as Theme) || 'auto');
  verbose = $state(prefs.get('verbose') === '1' || import.meta.env.DEV);

  connected = $derived(this.state === 'connected' || this.state === 'warning');
  busy = $derived(this.state === 'requesting' || this.state === 'connecting' || this.state === 'calibrating' || this.state === 'reconnecting');

  constructor() {
    this.meter = new LightMaster({ verbose: this.verbose });
    this.meter.addEventListener('status', (e) => {
      const { state, message } = (e as CustomEvent).detail;
      this.state = state;
      this.message = message;
      if (state === 'connected') this.deviceName = this.meter.device?.name ?? 'Light Master';
    });
    this.meter.addEventListener('reading', (e) => {
      this.reading = (e as CustomEvent<Reading>).detail;
    });
    this.meter.addEventListener('log', (e) => {
      const entry = (e as CustomEvent<LogEntry>).detail;
      const next = this.logs.length >= MAX_LOG ? this.logs.slice(-MAX_LOG + 1) : this.logs.slice();
      next.push(entry);
      this.logs = next;
      if (import.meta.env.DEV) devLog(entry);
    });
    this.meter.addEventListener('disconnected', () => {
      this.live = false;
      this.flickerBusy = false;
      this.deviceName = null;
    });
    this.applyTheme();
    void this.refreshKnownDevice();
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    prefs.set('theme', theme === 'auto' ? null : theme);
    this.applyTheme();
  }

  private applyTheme() {
    if (typeof document === 'undefined') return;
    if (this.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', this.theme);
  }

  setVerbose(on: boolean) {
    this.verbose = on;
    this.meter.verbose = on;
    prefs.set('verbose', on ? '1' : null);
  }

  async refreshKnownDevice() {
    const devices = await permittedDevices();
    const d = devices.find((x) => /sigmesh|light ?master|lmaster|lm4/i.test(x.name ?? '')) ?? null;
    this.knownDevice = d ? { name: d.name || 'Light Master', id: d.id } : null;
  }

  private fail(err: unknown) {
    const e = err as Error;
    if (e?.name === 'NotFoundError' && /cancel/i.test(e.message)) {
      // chooser dismissed
      this.state = this.meter.connected ? this.state : 'idle';
      return;
    }
    this.error = e?.message || String(err);
  }

  /** Open the browser's device chooser (must run from a click). */
  async connect(showAll = false) {
    this.error = null;
    if (this.meter.connected) this.meter.disconnect();
    try {
      await this.meter.connect({ showAll });
      await this.refreshKnownDevice();
      return true;
    } catch (err) {
      this.fail(err);
      return false;
    }
  }

  /** Reconnect to a meter this site was allowed before, without the chooser if the browser supports it. */
  async reconnect() {
    this.error = null;
    const devices = await permittedDevices();
    const device = devices.find((d) => d.id === this.knownDevice?.id) ?? devices.find((d) => /sigmesh|light ?master|lmaster|lm4/i.test(d.name ?? ''));
    if (!device) return this.connect();
    try {
      await this.meter.attach(device);
      return true;
    } catch (first) {
      this.meter.log(`direct reconnect failed (${(first as Error).message}); waiting for an advertisement`, 'warn');
      const seen = await advertisingState(device, 8000);
      if (seen === 'seen') {
        try {
          await this.meter.attach(device);
          return true;
        } catch (err) {
          this.fail(err);
          return false;
        }
      }
      this.error = seen === 'silent' ? 'The meter is not advertising. Wake it (LED flashing) and make sure no other app is connected.' : (first as Error).message;
      return false;
    }
  }

  disconnect() {
    this.live = false;
    this.meter.disconnect();
  }

  async forceRelease() {
    this.live = false;
    this.meter.dispose();
    const r = await releasePermittedDevices({ forget: true, log: (m, l) => this.meter.log(m, l) });
    this.state = 'idle';
    this.deviceName = null;
    await this.refreshKnownDevice();
    return r;
  }

  /** Photometry Start: connect if needed, then poll continuously. */
  async startLive() {
    this.error = null;
    if (!this.meter.connected) {
      const ok = this.knownDevice ? await this.reconnect() : await this.connect();
      if (!ok) return;
    }
    // As the app, a new run starts from a blank display.
    this.reading = null;
    this.live = true;
    this.meter.startPolling(POLL_MS);
  }

  stopLive() {
    this.live = false;
    this.meter.stopPolling();
  }

  /** Flicker Start: one capture sequence (26 µs, then the refining capture). */
  async measureFlicker() {
    this.error = null;
    if (!this.meter.connected) {
      const ok = this.knownDevice ? await this.reconnect() : await this.connect();
      if (!ok) return null;
    }
    this.stopLive();
    this.flickerBusy = true;
    try {
      const f = await this.meter.measureFlicker('auto');
      this.flicker = f;
      return f;
    } catch (err) {
      this.error = (err as Error).message;
      return null;
    } finally {
      this.flickerBusy = false;
    }
  }

  clearLog() {
    this.logs = [];
  }

  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  notify(message: string, ms = 2600) {
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), ms);
  }
}

export const app = new AppState();

// Dev: a hot update of this module creates a new session; retire the old one so
// two sessions never fight over the meter's single connection.
if (import.meta.hot) import.meta.hot.dispose(() => app.meter.dispose());

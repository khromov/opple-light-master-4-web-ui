// Web Bluetooth session with an Opple Light Master 4.
//
// Connection handling is ported from sunday-light-meter's OppleMeter (MIT,
// Copyright (c) 2026 Sunday Light), whose failure paths were learned on real
// hardware: the meter accepts one link at a time, a timed-out connect must be
// cancelled explicitly, and a failed session must stop listening on the
// shared BluetoothDevice or it reconnects behind the page's back.
//
// Events: 'status' {state, message}, 'reading' (Reading), 'flicker'
// (FlickerResult), 'log' {ts, level, message}, 'disconnected'.

import {
  FLICKER_PAGE_STRIDE,
  FLICKER_SAMPLES,
  MessageAssembler,
  NUS_RX,
  NUS_SERVICE,
  NUS_TX,
  OPCODE,
  OPPLE_COMPANY_ID,
  buildCommand,
  encapsulate,
  flickerRequestBody,
  hex,
  opcodeOf,
  parseCalibration,
  parseFlickerPage,
  parseMeasurement,
  type Calibration,
  type RawMeasurement,
} from './protocol';
import { lm4Battery, lm4Calibrate, lm4Process, type Photometry } from '../science/lm4';
import { analyseFlicker, refineFrequency, type FlickerPeriod, type FlickerResult } from '../science/flicker';

export const REQUEST_OPTIONS: RequestDeviceOptions = {
  filters: [
    { namePrefix: 'SigMesh' }, // Light Master 4 advertises as "SigMesh"
    { namePrefix: 'LightMaster' },
    { namePrefix: 'Light Master' },
    { namePrefix: 'LMaster' },
    { namePrefix: 'LM4' },
    { manufacturerData: [{ companyIdentifier: OPPLE_COMPANY_ID }] },
    { services: [NUS_SERVICE] },
  ],
  optionalServices: [NUS_SERVICE],
};

export const REQUEST_OPTIONS_ALL: RequestDeviceOptions = {
  acceptAllDevices: true,
  optionalServices: [NUS_SERVICE],
};

const CONNECT_TIMEOUT_MS = 15000;
const COMMAND_TIMEOUT_MS = 3000;
const FLICKER_TIMEOUT_MS = 15000; // the app's freqTimer
const MAX_CONSECUTIVE_TIMEOUTS = 3;
const RECONNECT_ATTEMPTS = 3;

export type MeterState =
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'calibrating'
  | 'connected'
  | 'warning'
  | 'reconnecting'
  | 'disconnected';

export interface Reading extends Photometry {
  raw: number[];
  kSensor: number[] | null;
  calibrated: boolean;
  battery: { mv: number | null; percent: number | null };
  batteryRaw: number;
  /** Unused word from the measurement frame (probably the NIR channel); diagnostics only. */
  aux: number;
  ts: number;
}

export interface LogEntry {
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

export function bluetoothSupport(): { ok: true } | { ok: false; reason: 'no-api' | 'insecure' } {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) return { ok: false, reason: 'no-api' };
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { ok: false, reason: 'insecure' };
  return { ok: true };
}

export async function permittedDevices(): Promise<BluetoothDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.bluetooth || typeof navigator.bluetooth.getDevices !== 'function') return [];
  try {
    return await navigator.bluetooth.getDevices();
  } catch {
    return [];
  }
}

/** Drop every link this page holds on previously permitted meters, optionally revoking the permission. */
export async function releasePermittedDevices({ forget = false, log = (_m: string, _l?: LogEntry['level']) => {} } = {}) {
  const devices = await permittedDevices();
  let released = 0;
  let forgotten = 0;
  for (const d of devices) {
    const name = d.name || '(no name)';
    const wasConnected = !!d.gatt?.connected;
    try {
      d.gatt?.disconnect();
      if (wasConnected) released++;
      log(`released ${name}${wasConnected ? ' (was connected in this tab)' : ''}`);
    } catch (err) {
      log(`release ${name}: ${(err as Error).message}`, 'warn');
    }
    if (forget && typeof d.forget === 'function') {
      try {
        await d.forget();
        forgotten++;
        log(`forgot ${name}`);
      } catch (err) {
        log(`forget ${name}: ${(err as Error).message}`, 'warn');
      }
    }
  }
  return { devices: devices.length, released, forgotten };
}

/** Listen for advertisements for `ms`. A Light Master that is connected to anything does not advertise. */
export async function advertisingState(device: BluetoothDevice, ms = 6000): Promise<'seen' | 'silent' | 'unsupported'> {
  if (!device || typeof device.watchAdvertisements !== 'function') return 'unsupported';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const seen = new Promise<'seen'>((resolve) => device.addEventListener('advertisementreceived', () => resolve('seen'), { once: true }));
    await device.watchAdvertisements({ signal: ctrl.signal });
    const aborted = new Promise<'silent'>((resolve) => ctrl.signal.addEventListener('abort', () => resolve('silent'), { once: true }));
    return await Promise.race([seen, aborted]);
  } catch {
    return 'unsupported';
  } finally {
    clearTimeout(timer);
    if (!ctrl.signal.aborted) ctrl.abort();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Turn a raw measurement + calibration into the full processed reading. */
export function processMeasurement(meas: RawMeasurement, cal: Calibration | null): Reading {
  const kSensor = cal?.kSensor ?? null;
  const channels = lm4Calibrate(meas.raw, kSensor ?? new Array(9).fill(1));
  return {
    ...lm4Process(channels),
    raw: meas.raw,
    kSensor,
    calibrated: !!kSensor,
    battery: lm4Battery(meas.batteryRaw),
    batteryRaw: meas.batteryRaw,
    aux: meas.aux,
    ts: Date.now(),
  };
}

interface Pending {
  opcode: number;
  /** Return true when the exchange is complete. */
  onMessage: (msg: Uint8Array) => boolean;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  sentAt: number;
}

export class LightMaster extends EventTarget {
  verbose: boolean;
  device: BluetoothDevice | null = null;
  calibration: Calibration | null = null;
  lastRaw: RawMeasurement | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private seq = 0;
  private assembler: MessageAssembler;
  private pending: Pending | null = null;
  private busy: Promise<unknown> = Promise.resolve();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollInterval = 500;
  /** The user asked for continuous measurement (survives pauses and reconnects). */
  private wantPolling = false;
  /** The poll loop is running; each start gets a new generation so a stale loop exits. */
  private loopGen = 0;
  private loopActive = false;
  private disconnectAnnounced = false;
  private flickerTimeoutMs: number;
  private consecutiveTimeouts = 0;
  private manualDisconnect = false;
  /** Session counters for disconnect diagnostics. */
  private stats = { connectedAt: 0, lastTx: 0, lastTxOp: 0, lastRx: 0, commands: 0, captures: 0, lastCaptureLux: null as number | null };
  private reconnecting = false;
  private established = false;

  constructor({ verbose = false, flickerTimeoutMs = FLICKER_TIMEOUT_MS } = {}) {
    super();
    this.verbose = verbose;
    this.flickerTimeoutMs = flickerTimeoutMs;
    this.assembler = new MessageAssembler((m) => this.log(`reassembly: ${m}`, 'warn'));
    this.onNotify = this.onNotify.bind(this);
    this.onGattDisconnected = this.onGattDisconnected.bind(this);
  }

  get connected(): boolean {
    return !!(this.server && this.server.connected && this.writeChar);
  }

  get isPolling(): boolean {
    return this.loopActive;
  }

  private emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  log(message: string, level: LogEntry['level'] = 'info') {
    this.emit('log', { ts: Date.now(), level, message } satisfies LogEntry);
  }

  private debug(message: string) {
    if (this.verbose) this.log(message, 'debug');
  }

  private status(state: MeterState, message: string) {
    this.log(`${state}: ${message}`);
    this.emit('status', { state, message });
  }

  /** Prompt for a meter and open the session. Must run inside a user gesture. */
  async connect({ showAll = false } = {}) {
    const support = bluetoothSupport();
    if (!support.ok) throw new Error(support.reason === 'insecure' ? 'Web Bluetooth needs an https page' : 'This browser has no Web Bluetooth (use Chrome or Edge)');
    this.status('requesting', 'Choose your Light Master in the browser dialog');
    const device = await navigator.bluetooth.requestDevice(showAll ? REQUEST_OPTIONS_ALL : REQUEST_OPTIONS);
    return this.attach(device);
  }

  /** Open a session on a device already permitted (e.g. from getDevices()). */
  async attach(device: BluetoothDevice) {
    if (device.gatt?.connected) this.log('browser already reports this device as connected - a stale link from an earlier session', 'warn');
    this.device = device;
    this.manualDisconnect = false;
    this.established = false;
    this.log(`chosen device "${device.name || '(no name)'}" id=${device.id}`);
    device.addEventListener('gattserverdisconnected', this.onGattDisconnected);
    try {
      await this.openSession();
    } catch (err) {
      this.log(`session failed: ${(err as Error).name || ''} ${(err as Error).message}`, 'error');
      this.dispose();
      throw err;
    }
    this.established = true;
    return this.info();
  }

  private async openSession() {
    const device = this.device!;
    this.status('connecting', `Connecting to ${device.name || 'Light Master'}`);
    try {
      this.server = await withTimeout(device.gatt!.connect(), CONNECT_TIMEOUT_MS, 'GATT connect');
    } catch (err) {
      this.cancelPendingConnect();
      throw err;
    }
    this.log('GATT connected, discovering the UART service');
    const service = await withTimeout(this.server.getPrimaryService(NUS_SERVICE), CONNECT_TIMEOUT_MS, 'service discovery');
    const tx = await service.getCharacteristic(NUS_TX);
    let rx: BluetoothRemoteGATTCharacteristic | null = null;
    try {
      rx = await service.getCharacteristic(NUS_RX);
    } catch {
      rx = null;
    }
    // Chrome exposes the properties as prototype getters, so enumerate them by name.
    const PROPS = ['broadcast', 'read', 'writeWithoutResponse', 'write', 'notify', 'indicate', 'authenticatedSignedWrites', 'reliableWrite', 'writableAuxiliaries'] as const;
    const props = (c: BluetoothRemoteGATTCharacteristic | null) => (c ? PROPS.filter((k) => c.properties[k]).join(',') : 'absent');
    this.log(`TX 0003 props=[${props(tx)}] RX 0002 props=[${props(rx)}]`);
    if (tx.properties.write || tx.properties.writeWithoutResponse) this.writeChar = tx;
    else if (rx) this.writeChar = rx;
    else throw new Error('No writable characteristic on this device');
    this.notifyChar = tx;
    this.assembler.reset();
    this.pending = null;
    tx.addEventListener('characteristicvaluechanged', this.onNotify);
    await withTimeout(tx.startNotifications(), CONNECT_TIMEOUT_MS, 'notification subscribe');
    this.log(`notifications on, writing commands to ${this.writeChar === tx ? '0003' : '0002'}`);

    this.status('calibrating', 'Reading sensor calibration');
    this.calibration = await this.readCalibration();
    if (this.calibration) this.log(`calibration kSensor = ${this.calibration.kSensor.map((k) => k.toFixed(4)).join(', ')}`);
    else this.log('calibration read failed twice - continuing with raw counts', 'warn');
    const first = await this.measureRaw(4000);
    this.log(`first measurement raw=[${first.raw.join(', ')}] aux=${first.aux} battery=${first.batteryRaw}`);
    this.stats = { connectedAt: performance.now(), lastTx: 0, lastTxOp: 0, lastRx: 0, commands: 0, captures: 0, lastCaptureLux: null };
    this.consecutiveTimeouts = 0;
    this.disconnectAnnounced = false;
    this.status('connected', 'Light Master 4 connected');
    this.emit('reading', processMeasurement(first, this.calibration));
  }

  info() {
    return { name: this.device?.name ?? null, id: this.device?.id ?? null, kSensor: this.calibration?.kSensor ?? null };
  }

  private async readCalibration(): Promise<Calibration | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const msg = await this.command(OPCODE.REQ_CAL, OPCODE.RES_CAL, COMMAND_TIMEOUT_MS);
        const cal = parseCalibration(msg);
        if (cal) return cal;
        this.log(`calibration response too short (${msg.length} bytes)`, 'warn');
      } catch (err) {
        this.log(`calibration attempt ${attempt + 1}: ${(err as Error).message}`, 'warn');
      }
    }
    return null;
  }

  async measureRaw(timeout = COMMAND_TIMEOUT_MS): Promise<RawMeasurement> {
    const msg = await this.command(OPCODE.REQ_MEAS, OPCODE.RES_MEAS, timeout);
    const meas = parseMeasurement(msg);
    if (!meas) throw new Error(`Unparseable measurement (${msg.length} bytes)`);
    this.lastRaw = meas;
    return meas;
  }

  /** One calibrated, processed reading. */
  async measure(timeout = COMMAND_TIMEOUT_MS): Promise<Reading> {
    return processMeasurement(await this.measureRaw(timeout), this.calibration);
  }

  /** Send one command and resolve with the first message carrying `responseOpcode`. */
  command(opcode: number, responseOpcode: number, timeout = COMMAND_TIMEOUT_MS, body?: Uint8Array): Promise<Uint8Array> {
    let result: Uint8Array | null = null;
    return this.exchange(opcode, responseOpcode, timeout, body, (msg) => {
      result = msg;
      return true;
    }).then(() => result!);
  }

  private exchange(opcode: number, responseOpcode: number, timeout: number, body: Uint8Array | undefined, onMessage: (msg: Uint8Array) => boolean): Promise<void> {
    if (!this.connected) return Promise.reject(new Error('Not connected'));
    if (this.pending) return Promise.reject(new Error('Command already in flight'));
    this.seq = (this.seq + 1) & 0xff;
    const frames = encapsulate(buildCommand(opcode, this.seq, body));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('Meter did not answer (is it awake?)'));
      }, timeout);
      this.pending = { opcode: responseOpcode, onMessage, resolve, reject, timer, sentAt: performance.now() };
      this.stats.lastTx = performance.now();
      this.stats.lastTxOp = opcode;
      this.stats.commands++;
      this.writeFrames(frames).catch((err) => {
        clearTimeout(timer);
        this.pending = null;
        reject(err);
      });
    });
  }

  private async writeFrames(frames: Uint8Array[]) {
    for (const f of frames) {
      this.debug(`> ${hex(f)}`);
      const c = this.writeChar!;
      const data = f as Uint8Array<ArrayBuffer>;
      if (c.properties.writeWithoutResponse && typeof c.writeValueWithoutResponse === 'function') {
        try {
          await c.writeValueWithoutResponse(data);
          continue;
        } catch (err) {
          if (!c.properties.write) throw err;
          this.log(`write-without-response failed (${(err as Error).message}); using write-with-response`, 'warn');
        }
      }
      if (typeof c.writeValueWithResponse === 'function') await c.writeValueWithResponse(data);
      else await c.writeValue(data);
    }
  }

  private onNotify(event: Event) {
    const dv = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    this.debug(`< ${hex(bytes)}`);
    this.stats.lastRx = performance.now();
    const msg = this.assembler.feed(bytes);
    if (!msg) return;
    const code = opcodeOf(msg);
    const p = this.pending;
    if (p && code === p.opcode) {
      let done = false;
      try {
        done = p.onMessage(msg);
      } catch (err) {
        this.pending = null;
        clearTimeout(p.timer);
        p.reject(err as Error);
        return;
      }
      if (done) {
        this.pending = null;
        clearTimeout(p.timer);
        this.debug(`response 0x${code.toString(16)} in ${Math.round(performance.now() - p.sentAt)} ms`);
        p.resolve();
      }
    } else {
      this.debug(`ignored message opcode=0x${code.toString(16)} len=${msg.length}${p ? ` (waiting for 0x${p.opcode.toString(16)})` : ''}`);
    }
  }

  /** Run `fn` with polling paused and no other exchange in flight. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      this.haltLoop();
      // Let an in-flight poll finish or time out.
      const t0 = performance.now();
      while (this.pending && performance.now() - t0 < COMMAND_TIMEOUT_MS + 500) await sleep(20);
      try {
        return await fn();
      } finally {
        if (this.wantPolling && this.connected) this.startLoop();
      }
    };
    const next = this.busy.then(run, run);
    this.busy = next.catch(() => {});
    return next;
  }

  /** One flicker capture at a fixed sampling period: REQ_FREQ, then four RES_FREQ pages. */
  async captureFlicker(period: FlickerPeriod): Promise<FlickerResult> {
    const samples = new Array<number>(FLICKER_SAMPLES).fill(0);
    const got = new Set<number>();
    let dataType = 0;
    let embedded: RawMeasurement | null = null;
    await this.exchange(OPCODE.REQ_FREQ, OPCODE.RES_FREQ, this.flickerTimeoutMs, flickerRequestBody(period), (msg) => {
      const page = parseFlickerPage(msg);
      if (!page) {
        this.log(`unparseable flicker page (${msg.length} bytes)`, 'warn');
        return false;
      }
      this.debug(`flicker page ${page.page} type=${page.dataType} meta=${hex(page.meta)}`);
      samples.splice(page.page * FLICKER_PAGE_STRIDE, page.samples.length, ...page.samples);
      got.add(page.page);
      // The app analyses on page 3, with that page's gain range and embedded measurement.
      if (page.page === 3) {
        dataType = page.dataType;
        embedded = page.measurement;
      }
      return got.size === 4;
    });
    const lux = embedded ? processMeasurement(embedded, this.calibration).lux : null;
    const result = analyseFlicker(samples, dataType, period, lux);
    this.stats.captures++;
    this.stats.lastCaptureLux = lux;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    this.log(
      `flicker capture ${period}: range ${dataType}, embedded lux ${lux?.toFixed(1) ?? 'n/a'}, samples ${min}..${max} ` +
        `(signal ${result.quality.level.toFixed(0)} counts, ${result.quality.status}) -> MD ${result.modulation.toFixed(2)}% ` +
        `FI ${result.flickerIndex.toFixed(4)} f ${result.frequency.toFixed(0)} Hz`,
    );
    return result;
  }

  /**
   * Flicker measurement as the official app runs it: a 26 µs capture gives
   * modulation depth and flicker index; the frequency is then refined with a
   * 150 µs capture (≤ 2 kHz) or a 12.285 µs one (> 2 kHz). A single fixed
   * period can be forced instead.
   */
  async measureFlicker(mode: 'auto' | FlickerPeriod = 'auto'): Promise<FlickerResult> {
    return this.exclusive(async () => {
      // The app re-reads the calibration before every flicker measurement and stops if that fails.
      const cal = await this.readCalibration();
      if (!cal) throw new Error('Data access failed. Please try again.');
      this.calibration = cal;
      const capture = async (p: FlickerPeriod) => {
        try {
          return await this.captureFlicker(p);
        } catch (err) {
          // Let stragglers from the failed capture drain before the next request.
          await sleep(1000);
          const message = (err as Error).message;
          if (/did not answer/.test(message)) throw new Error('The strobe data received is incomplete. Please try again.');
          if (/Disconnected|Not connected/.test(message)) throw new Error('Light Master disconnected.');
          throw err;
        }
      };
      let result: FlickerResult;
      if (mode !== 'auto') {
        result = await capture(mode);
      } else {
        const base = await capture(25);
        if (base.quality.status === 'saturated' || base.quality.status === 'too-dim') {
          // Nothing to refine, and captures in an overloaded state preceded meter lock-ups on hardware.
          this.log(`skipping the refining capture: signal ${base.quality.status}`, 'warn');
          result = base;
        } else {
          let refineError: string | undefined;
          const second = await capture(base.frequency > 2000 ? 11 : 146).catch((err) => {
            refineError = (err as Error).message;
            this.log(`frequency refinement failed: ${refineError}`, 'warn');
            return null;
          });
          // The app reports an error here; keeping the first capture with a note is more useful.
          result = refineError ? { ...base, refineError } : refineFrequency(base, second);
        }
      }
      this.emit('flicker', result);
      return result;
    });
  }

  /** Measure continuously, every `intervalMs` from request to request (the app uses 480 ms). */
  startPolling(intervalMs = 500) {
    this.pollInterval = intervalMs;
    this.wantPolling = true;
    this.startLoop();
  }

  stopPolling() {
    this.wantPolling = false;
    this.haltLoop();
  }

  private startLoop() {
    this.haltLoop();
    const gen = ++this.loopGen;
    this.loopActive = true;
    const live = () => gen === this.loopGen && this.loopActive && this.connected;
    const tick = async () => {
      if (!live()) return;
      const started = performance.now();
      if (!this.pending) {
        try {
          const reading = await this.measure(COMMAND_TIMEOUT_MS);
          this.consecutiveTimeouts = 0;
          if (live()) this.emit('reading', reading);
        } catch (err) {
          if (!live()) return;
          this.consecutiveTimeouts += 1;
          // The app ignores a missed poll; three in a row means the link is dead.
          this.log(`poll: ${(err as Error).message} (${this.consecutiveTimeouts}/${MAX_CONSECUTIVE_TIMEOUTS})`, 'warn');
          if (this.consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
            this.status('warning', 'Meter stopped answering - reconnecting');
            this.recycleLink();
            return;
          }
        }
      }
      if (live()) this.pollTimer = setTimeout(tick, Math.max(20, this.pollInterval - (performance.now() - started)));
    };
    this.pollTimer = setTimeout(tick, 0);
  }

  private haltLoop() {
    this.loopActive = false;
    this.loopGen++;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private cancelPendingConnect() {
    try {
      if (this.device?.gatt) {
        if (this.device.gatt.connected) this.log('dropping the GATT link');
        this.device.gatt.disconnect();
      }
    } catch {
      // ignore
    }
  }

  private recycleLink() {
    this.haltLoop();
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    else void this.onGattDisconnected();
  }

  /** Retire this session for good: no auto-reconnect, off the device's events, link dropped. */
  dispose() {
    this.manualDisconnect = true;
    this.established = false;
    this.wantPolling = false;
    this.device?.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
    this.teardown();
    this.cancelPendingConnect();
  }

  private teardown() {
    this.haltLoop();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Disconnected'));
      this.pending = null;
    }
    try {
      this.notifyChar?.removeEventListener('characteristicvaluechanged', this.onNotify);
    } catch {
      // ignore
    }
    this.writeChar = null;
    this.notifyChar = null;
  }

  private describeDrop(): string {
    const now = performance.now();
    const st = this.stats;
    if (!st.connectedAt) return 'before the session opened';
    const ago = (t: number) => (t ? `${((now - t) / 1000).toFixed(1)} s ago` : 'never');
    return (
      `after ${((now - st.connectedAt) / 1000).toFixed(0)} s connected; last command 0x${st.lastTxOp.toString(16)} ${ago(st.lastTx)}, ` +
      `last notification ${ago(st.lastRx)}; ${st.commands} commands, ${st.captures} flicker captures` +
      (st.lastCaptureLux !== null ? ` (last at ${st.lastCaptureLux.toFixed(0)} lx)` : '') +
      `; command in flight: ${this.pending ? `0x${this.pending.opcode.toString(16)}` : 'none'}`
    );
  }

  private async onGattDisconnected() {
    this.log(`GATT link dropped ${this.describeDrop()}`, this.manualDisconnect ? 'info' : 'warn');
    this.stats.connectedAt = 0;
    this.teardown();
    if (this.manualDisconnect || this.reconnecting || !this.established) {
      if (this.manualDisconnect) {
        this.dispose();
        this.announceDisconnected('Disconnected');
      }
      return;
    }
    // The meter drops the link when it sleeps or loses range: try to come back.
    this.reconnecting = true;
    try {
      for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS && !this.manualDisconnect; attempt++) {
        this.status('reconnecting', `Link lost - reconnecting (${attempt}/${RECONNECT_ATTEMPTS})`);
        try {
          await sleep(800 * attempt);
          if (this.manualDisconnect) break;
          await this.openSession();
          if (this.manualDisconnect) {
            this.teardown();
            this.cancelPendingConnect();
            break;
          }
          if (this.wantPolling) this.startLoop();
          this.reconnecting = false;
          return;
        } catch (err) {
          this.log(`reconnect ${attempt} failed: ${(err as Error).message}`, 'warn');
          this.teardown();
          this.cancelPendingConnect();
        }
      }
    } finally {
      this.reconnecting = false;
    }
    const device = this.device;
    const userStopped = this.manualDisconnect;
    this.dispose();
    this.announceDisconnected(userStopped ? 'Disconnected' : 'Meter disconnected - press its button to wake it, then connect again');
    if (device && !userStopped) {
      // Tell a meter that is merely asleep/out of range apart from one that has locked up.
      const adv = await advertisingState(device, 6000);
      this.log(
        adv === 'seen'
          ? 'meter is advertising again: it can be reconnected'
          : adv === 'silent'
            ? 'meter is not advertising: it is off, asleep, connected elsewhere or locked up (switch it off and on)'
            : 'cannot check advertising in this browser',
        adv === 'silent' ? 'warn' : 'info',
      );
    }
  }

  private announceDisconnected(message: string) {
    if (this.disconnectAnnounced) return;
    this.disconnectAnnounced = true;
    this.status('disconnected', message);
    this.emit('disconnected', {});
  }

  disconnect() {
    this.manualDisconnect = true;
    this.wantPolling = false;
    this.log('disconnect requested');
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    else void this.onGattDisconnected();
  }
}

// A simulated Light Master 4 behind a minimal Web Bluetooth stand-in. Used
// by the session tests and by the `?demo` page mode. It answers with the
// same frame layouts as the real meter: calibration and measurement frames
// captured from a real unit, and four-page flicker captures.
//
// Like Chrome, requestDevice() hands back the same BluetoothDevice each time.

import { FLICKER_MODES } from '../science/flicker';
import { NUS_RX, NUS_TX, OPCODE, encapsulate, opcodeOf } from './protocol';

// Real LM4 calibration payload (sunday-light-meter capture, 1 Sep 2026).
const REAL_CAL = '002381843fb6c5853f0c05783f7bed8d3fe5fa843f5de5863ff6a0883f69ed983f0000803fa986993fc8edb13f0cf2';
// Raw channels of a real 4239 K LED (opple-bridge probe), scaled per light level.
const BASE_RAW = [654, 819, 855, 1152, 1330, 1719, 2595, 3715, 14571];

export interface FakeLight {
  /** Multiplier on BASE_RAW (1 ≈ 2100 lx). */
  level: number;
  /** Flicker: frequency (Hz) and modulation depth (0..1) of a sine ripple. */
  flickerHz: number;
  modulation: number;
  /** Random noise on measurements, fraction of value. */
  noise: number;
}

export interface FakeOptions {
  light?: Partial<FakeLight>;
  /** ms after link n comes up at which the meter drops it, or null to keep it. */
  dropAfter?: (link: number) => number | null;
  answerMs?: number;
  /** Called for every frame the page writes. */
  onWrite?: (frame: Uint8Array) => void;
  /** Drop this notification index (0-based, counted across the session) to simulate loss. */
  loseNotification?: (n: number) => boolean;
}

const hexBytes = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

function responseHeader(opcode: number, seq: number, bodyLen: number): number[] {
  // Real responses carry 0x00 at [1] and the request's sequence number at [5].
  return [0x00, 0x00, 0x00, 0x00, 0x00, seq & 0xff, bodyLen & 0xff, 0x00, 0x00, (opcode >> 8) & 0xff, opcode & 0xff];
}

function frame(opcode: number, seq: number, body: Uint8Array | number[]): Uint8Array[] {
  const b = body instanceof Uint8Array ? body : Uint8Array.from(body);
  const msg = new Uint8Array(11 + b.length);
  msg.set(responseHeader(opcode, seq, b.length));
  msg.set(b, 11);
  return encapsulate(msg);
}

function measurementBytes(light: FakeLight, temp10 = 275, battery = 3314): number[] {
  const out: number[] = [];
  for (const r of BASE_RAW) {
    const v = Math.max(0, Math.min(65535, Math.round(r * light.level * (1 + (Math.random() * 2 - 1) * light.noise))));
    out.push(v >> 8, v & 0xff);
  }
  out.push(temp10 >> 8, temp10 & 0xff, battery >> 8, battery & 0xff);
  return out;
}

function packSamples(samples: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += 4) {
    const [a, b, c, d] = samples.slice(i, i + 4).map((s) => Math.max(0, Math.min(4095, Math.round(s))));
    const w0 = (a << 4) | (b >> 8);
    const w1 = ((b & 0xff) << 8) | (c >> 4);
    const w2 = ((c & 0x0f) << 12) | d;
    out.push(w0 >> 8, w0 & 0xff, w1 >> 8, w1 & 0xff, w2 >> 8, w2 & 0xff);
  }
  return out;
}

function flickerPages(light: FakeLight, period: number, seq: number): Uint8Array[] {
  const us = FLICKER_MODES[period as keyof typeof FLICKER_MODES] ?? 26;
  const dataType = 1;
  const dc = 15.8720703125;
  const mean = 1400 * Math.min(1, light.level);
  const samples = Array.from({ length: 1024 }, (_, i) => {
    const t = (i * us) / 1e6;
    const ripple = light.flickerHz > 0 ? light.modulation * Math.sin(2 * Math.PI * light.flickerHz * t) : 0;
    return dc + mean * (1 + ripple) + (Math.random() * 2 - 1) * 2;
  });
  const frames: Uint8Array[] = [];
  for (let page = 0; page < 4; page++) {
    const n = page === 3 ? 244 : 260;
    const body = [0x00, page, dataType, ...measurementBytes(light), ...packSamples(samples.slice(page * 260, page * 260 + n))];
    frames.push(...frame(OPCODE.RES_FREQ, seq, body));
  }
  return frames;
}

export interface FakeMeter {
  device: BluetoothDevice;
  links: number;
  writes: number;
  light: FakeLight;
  drop: () => void;
}

/** Install a fake `navigator.bluetooth` with one simulated Light Master 4. */
export function installFakeBluetooth(opts: FakeOptions = {}): FakeMeter {
  const light: FakeLight = { level: 1, flickerHz: 100, modulation: 0.06, noise: 0.004, ...opts.light };
  const answerMs = opts.answerMs ?? 12;
  const dropAfter = opts.dropAfter ?? (() => null);
  const state = { links: 0, writes: 0, notifications: 0 };
  let up = false;
  let epoch = 0;
  let dropTimer: ReturnType<typeof setTimeout> | undefined;
  let waiting: { resolve: (g: unknown) => void; reject: (e: Error) => void }[] = [];

  const device = new EventTarget() as EventTarget & Record<string, unknown>;
  device.name = 'SigMesh';
  device.id = 'fake-lm4';
  const gatt: Record<string, unknown> = { connected: false, device };
  device.gatt = gatt;
  device.watchAdvertisements = async () => {
    setTimeout(() => device.dispatchEvent(Object.assign(new Event('advertisementreceived'), { rssi: -50 })), 50);
  };
  device.forget = async () => {};

  const notConnected = () => Object.assign(new Error('GATT Server is disconnected.'), { name: 'NetworkError' });
  const tx = Object.assign(new EventTarget(), {
    uuid: NUS_TX,
    value: null as DataView | null,
    properties: { notify: true, write: true, writeWithoutResponse: true },
    startNotifications: async () => {
      if (!up) throw notConnected();
    },
    writeValueWithoutResponse: async (data: Uint8Array) => {
      if (!up) throw notConnected();
      state.writes++;
      opts.onWrite?.(data);
      const msg = data.slice(3);
      const op = opcodeOf(msg);
      const seq = msg[4];
      let frames: Uint8Array[] = [];
      if (op === OPCODE.REQ_CAL) frames = frame(OPCODE.RES_CAL, seq, hexBytes(REAL_CAL));
      else if (op === OPCODE.REQ_MEAS) frames = frame(OPCODE.RES_MEAS, seq, [0x00, ...measurementBytes(light)]);
      else if (op === OPCODE.REQ_FREQ) frames = flickerPages(light, (msg[12] << 8) | msg[13], seq);
      const at = epoch;
      setTimeout(() => {
        for (const f of frames) {
          if (!up || at !== epoch) return;
          if (opts.loseNotification?.(state.notifications++)) continue;
          tx.value = new DataView(f.buffer, f.byteOffset, f.byteLength);
          tx.dispatchEvent(new Event('characteristicvaluechanged'));
        }
      }, op === OPCODE.REQ_FREQ ? answerMs * 5 : answerMs);
    },
  });
  const rx = Object.assign(new EventTarget(), { uuid: NUS_RX, properties: { write: true, writeWithoutResponse: true } });

  function linkDown() {
    const was = up;
    up = false;
    gatt.connected = false;
    epoch++;
    clearTimeout(dropTimer);
    for (const w of waiting) w.reject(Object.assign(new Error('Connection attempt cancelled'), { name: 'AbortError' }));
    waiting = [];
    if (was) device.dispatchEvent(new Event('gattserverdisconnected'));
  }

  gatt.connect = () =>
    new Promise((resolve, reject) => {
      if (up) {
        resolve(gatt);
        return;
      }
      waiting.push({ resolve, reject });
      if (waiting.length > 1) return;
      setTimeout(() => {
        if (!waiting.length) return;
        state.links++;
        up = true;
        gatt.connected = true;
        const ms = dropAfter(state.links);
        if (ms != null) dropTimer = setTimeout(linkDown, ms);
        const ws = waiting;
        waiting = [];
        for (const w of ws) w.resolve(gatt);
      }, 30);
    });
  gatt.disconnect = () => linkDown();
  gatt.getPrimaryService = (uuid: string) => {
    if (!gatt.connected) return Promise.reject(notConnected());
    const at = epoch;
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        if (!up || at !== epoch) reject(notConnected());
        else resolve({ uuid, getCharacteristic: async (u: string) => (u === NUS_TX ? tx : rx) });
      }, 20),
    );
  };

  const bluetooth = {
    requestDevice: async () => device,
    getDevices: async () => (state.links > 0 ? [device] : []),
  };
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav) Object.defineProperty(nav, 'bluetooth', { configurable: true, value: bluetooth });
  else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth } });

  return {
    device: device as unknown as BluetoothDevice,
    get links() {
      return state.links;
    },
    get writes() {
      return state.writes;
    },
    light,
    drop: linkDown,
  };
}

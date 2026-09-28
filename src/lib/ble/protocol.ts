// Opple Light Master 4 - BLE transport framing and payload parsing.
//
// The meter exposes a Nordic UART Service. Commands are an 11-byte header
// (+ optional body) wrapped in a small fragmentation layer; responses come
// back as notifications in the same framing. The official app writes
// commands to the *notify* characteristic (6e400003) without response.
//
// Framing and measurement/calibration layouts follow sunday-light-meter
// (MIT, Copyright (c) 2026 Sunday Light), verified on hardware. Flicker page
// layout follows gabrielebaudo/opple-bridge (MIT, Copyright (c) 2026 Gabriele
// Baudo) and the decompiled official app.

export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** Opple's Bluetooth SIG company identifier, present in the meter's advertisement. */
export const OPPLE_COMPANY_ID = 0x0539;

export const OPCODE = {
  REQ_MEAS: 0x0a00,
  RES_MEAS: 0x0a01,
  REQ_CAL: 0x0a04,
  RES_CAL: 0x0a05,
  REQ_FREQ: 0x0a0a,
  RES_FREQ: 0x0a0b,
} as const;

const FRAG_SINGLE = 0x00;
const FRAG_FIRST = 0x80;
const FRAG_MIDDLE = 0xa0;
const FRAG_LAST = 0xc0;
const FRAG_MASK = 0xe0;

export const HEADER_LEN = 11;

/** Build the inner message: 11-byte header followed by the body. */
export function buildCommand(opcode: number, seq: number, body: Uint8Array = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(HEADER_LEN + body.length);
  out.set([0x00, 0x13, 0x00, 0x00, seq & 0xff, 0x00, body.length & 0xff, 0x00, 0x00, (opcode >> 8) & 0xff, opcode & 0xff]);
  out.set(body, HEADER_LEN);
  return out;
}

/** Split an inner message into BLE write fragments (first carries 17 bytes, the rest 19). */
export function encapsulate(data: Uint8Array): Uint8Array[] {
  const n = data.length < 17 ? 1 : Math.ceil((data.length - 17) / 19) + 1;
  const frames: Uint8Array[] = [];
  for (let c = 0; c < n; c++) {
    let head: number[];
    let body: Uint8Array;
    if (c === 0) {
      const total = data.length + n + 2;
      head = [n > 1 ? FRAG_FIRST : FRAG_SINGLE, (total >> 8) & 0xff, total & 0xff];
      body = n > 1 ? data.subarray(0, 17) : data;
    } else if (c !== n - 1) {
      head = [FRAG_MIDDLE | c];
      body = data.subarray(17 + 19 * (c - 1), 17 + 19 * c);
    } else {
      head = [FRAG_LAST | c];
      body = data.subarray(17 + 19 * (c - 1));
    }
    const frame = new Uint8Array(head.length + body.length);
    frame.set(head);
    frame.set(body, head.length);
    frames.push(frame);
  }
  return frames;
}

export type AssemblerIssue = (message: string) => void;

/**
 * Reassembles fragmented notifications. feed() returns a complete inner
 * message or null. The first fragment carries the total byte count of all
 * fragments; a message whose fragments don't add up (a dropped or duplicated
 * notification) is discarded rather than returned with shifted bytes, which
 * matters for the 23-fragment flicker pages.
 */
export class MessageAssembler {
  private parts: Uint8Array[] | null = null;
  private expectedTotal = 0;
  private received = 0;
  private nextIndex = 1;
  constructor(private onIssue: AssemblerIssue = () => {}) {}

  reset(): void {
    this.parts = null;
  }

  feed(frame: Uint8Array): Uint8Array | null {
    if (!frame || frame.length === 0) return null;
    const type = frame[0] & FRAG_MASK;
    if (type === FRAG_SINGLE) {
      if (this.parts) this.onIssue('single frame arrived mid-message; previous message dropped');
      this.parts = null;
      return frame.slice(3);
    }
    if (type === FRAG_FIRST) {
      if (this.parts) this.onIssue('new message started before the previous one finished; previous dropped');
      this.expectedTotal = (frame[1] << 8) | frame[2];
      this.parts = [frame.slice(3)];
      this.received = frame.length;
      this.nextIndex = 1;
      return null;
    }
    if (type !== FRAG_MIDDLE && type !== FRAG_LAST) return null;
    if (!this.parts) return null; // orphan continuation
    const index = frame[0] & 0x1f;
    if (index !== (this.nextIndex & 0x1f)) {
      this.onIssue(`fragment ${index} arrived, expected ${this.nextIndex & 0x1f}; message dropped`);
      this.parts = null;
      return null;
    }
    this.nextIndex++;
    this.parts.push(frame.slice(1));
    this.received += frame.length;
    if (type === FRAG_MIDDLE) return null;
    const parts = this.parts;
    this.parts = null;
    if (this.expectedTotal && this.received !== this.expectedTotal) {
      this.onIssue(`message length ${this.received} != announced ${this.expectedTotal}; dropped`);
      return null;
    }
    const size = parts.reduce((a, p) => a + p.length, 0);
    const msg = new Uint8Array(size);
    let off = 0;
    for (const p of parts) {
      msg.set(p, off);
      off += p.length;
    }
    return msg;
  }
}

export function opcodeOf(msg: Uint8Array | null | undefined): number {
  if (!msg || msg.length < HEADER_LEN) return 0;
  return (msg[9] << 8) | msg[10];
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];

export interface RawMeasurement {
  /** F1..F8 (415..680 nm) + Clear, raw AS7341 counts. */
  raw: number[];
  batteryRaw: number;
  /**
   * Word at payload[19..20]. The official app ignores it; on hardware it tracks
   * light level (0x0002 at clear≈40, 0x0113 at clear≈1750), most likely the
   * AS7341 NIR channel. Kept for diagnostics only.
   */
  aux: number;
}

/**
 * RES_MEAS payload (23 bytes on the LM4, confirmed on hardware):
 *   [0] skip, [1..18] 9 x u16 BE (F1..F8 + clear), [19..20] aux (NIR?), [21..22] battery raw.
 */
export function parseMeasurementPayload(p: Uint8Array): RawMeasurement | null {
  if (p.length < 23) return null;
  const raw: number[] = [];
  for (let i = 0; i < 9; i++) raw.push(u16be(p, 1 + 2 * i));
  return { raw, batteryRaw: u16be(p, 21), aux: u16be(p, 19) };
}

export function parseMeasurement(msg: Uint8Array): RawMeasurement | null {
  if (!msg || msg.length < HEADER_LEN + 23) return null;
  return parseMeasurementPayload(msg.subarray(HEADER_LEN));
}

export interface Calibration {
  kSensor: number[];
  /** Two further factors after kSensor, meaning unknown. */
  extra: number[];
}

/** RES_CAL payload: 9 x float32 LE per-channel factors from payload[1] (LM4 sends 47 bytes). */
export function parseCalibration(msg: Uint8Array): Calibration | null {
  if (!msg || msg.length < HEADER_LEN + 37) return null;
  const p = msg.subarray(HEADER_LEN);
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const read = (i: number) => {
    const v = view.getFloat32(1 + 4 * i, true);
    return Number.isFinite(v) ? v : 1;
  };
  const kSensor: number[] = [];
  for (let i = 0; i < 9; i++) kSensor.push(read(i));
  const extra: number[] = [];
  if (p.length >= 45) extra.push(read(9), read(10));
  return { kSensor, extra };
}

/** REQ_FREQ body: [0x00, periodHi, periodLo]. */
export function flickerRequestBody(period: number): Uint8Array {
  return new Uint8Array([0x00, (period >> 8) & 0xff, period & 0xff]);
}

export interface FlickerPage {
  page: number;
  /** Sensor gain range; selects the ADC baseline subtracted before analysis. */
  dataType: number;
  samples: number[];
  /** Bytes [3..24] of the payload, kept for diagnostics. */
  meta: Uint8Array;
  /** Measurement embedded at payload[3..24]: 9 channels, aux word, battery (the app reads its lux). */
  measurement: RawMeasurement;
}

export const FLICKER_SAMPLES = 1024;
export const FLICKER_PAGE_STRIDE = 260;
const FLICKER_DATA_OFFSET = 25;

/**
 * RES_FREQ page payload: [0] skip, [1] page 0..3, [2] data type (gain range),
 * [3..24] an embedded measurement (9 x u16 BE channels, aux word, battery),
 * [25..] 12-bit samples packed 4 per 6 bytes (big-endian bitstream).
 * Pages 0-2 carry 260 samples, page 3 carries 244 (1024 in total).
 */
export function parseFlickerPage(msg: Uint8Array): FlickerPage | null {
  if (!msg || msg.length < HEADER_LEN + FLICKER_DATA_OFFSET + 6) return null;
  const p = msg.subarray(HEADER_LEN);
  const page = p[1];
  if (page > 3) return null;
  const want = page === 3 ? FLICKER_SAMPLES - 3 * FLICKER_PAGE_STRIDE : FLICKER_PAGE_STRIDE;
  const groups = Math.min(Math.floor((p.length - FLICKER_DATA_OFFSET) / 6), want / 4);
  const samples: number[] = [];
  for (let g = 0; g < groups; g++) {
    const o = FLICKER_DATA_OFFSET + g * 6;
    const a = u16be(p, o);
    const b = u16be(p, o + 2);
    const c = u16be(p, o + 4);
    samples.push(a >> 4, ((a & 0x0f) << 8) | (b >> 8), ((b & 0xff) << 4) | (c >> 12), c & 0x0fff);
  }
  // Embedded measurement has the RES_MEAS layout shifted by two bytes (no skip byte at [2]).
  const measurement = parseMeasurementPayload(p.subarray(2, 2 + 23))!;
  return { page, dataType: p[2], samples, meta: p.slice(3, FLICKER_DATA_OFFSET), measurement };
}

export const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');

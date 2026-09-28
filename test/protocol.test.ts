import { describe, expect, it } from 'vitest';
import {
  MessageAssembler,
  OPCODE,
  buildCommand,
  encapsulate,
  flickerRequestBody,
  opcodeOf,
  parseCalibration,
  parseFlickerPage,
  parseMeasurement,
} from '../src/lib/ble/protocol';

const hexBytes = (s: string) => s.match(/../g)!.map((b) => parseInt(b, 16));
const header = (opcode: number) => [0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, opcode >> 8, opcode & 0xff];
const msg = (opcode: number, payload: number[]) => Uint8Array.from([...header(opcode), ...payload]);

// Frames captured from a real Light Master 4 (sunday-light-meter, 1 Sep 2026).
const REAL_CAL = '002381843fb6c5853f0c05783f7bed8d3fe5fa843f5de5863ff6a0883f69ed983f0000803fa986993fc8edb13f0cf2';
const REAL_MEAS = '00004600bd00e0014e020002740358031006d501130cf2';

function roundTrip(inner: Uint8Array): Uint8Array | null {
  const asm = new MessageAssembler();
  let out: Uint8Array | null = null;
  for (const f of encapsulate(inner)) out = asm.feed(f) ?? out;
  return out;
}

describe('framing', () => {
  it('builds the 11-byte header', () => {
    expect(Array.from(buildCommand(OPCODE.REQ_MEAS, 5))).toEqual([0, 0x13, 0, 0, 5, 0, 0, 0, 0, 0x0a, 0x00]);
    const f = buildCommand(OPCODE.REQ_FREQ, 1, flickerRequestBody(146));
    expect(Array.from(f.subarray(9))).toEqual([0x0a, 0x0a, 0x00, 0x00, 146]);
    expect(f[6]).toBe(3);
  });

  it('encapsulates short commands in a single frame with the total length', () => {
    const frames = encapsulate(buildCommand(OPCODE.REQ_MEAS, 1));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0].subarray(0, 3))).toEqual([0x00, 0x00, 14]);
    expect(frames[0].length).toBe(14);
  });

  it('round-trips multi-fragment messages of every size', () => {
    for (let len = 11; len < 460; len += 7) {
      const inner = Uint8Array.from({ length: len }, (_, i) => (i * 31) & 0xff);
      const frames = encapsulate(inner);
      frames.forEach((f) => expect(f.length).toBeLessThanOrEqual(20));
      expect(Array.from(roundTrip(inner)!)).toEqual(Array.from(inner));
    }
  });

  it('drops a message with a missing fragment instead of shifting bytes', () => {
    const inner = Uint8Array.from({ length: 426 }, (_, i) => i & 0xff);
    const frames = encapsulate(inner);
    const issues: string[] = [];
    const asm = new MessageAssembler((m) => issues.push(m));
    let out: Uint8Array | null = null;
    frames.forEach((f, i) => {
      if (i !== 7) out = asm.feed(f) ?? out;
    });
    expect(out).toBeNull();
    expect(issues.length).toBeGreaterThan(0);
    // The next complete message still assembles.
    for (const f of frames) out = asm.feed(f) ?? out;
    expect(out).not.toBeNull();
  });

  it('reads the opcode', () => {
    expect(opcodeOf(msg(OPCODE.RES_FREQ, []))).toBe(0x0a0b);
    expect(opcodeOf(new Uint8Array(3))).toBe(0);
  });
});

describe('payloads', () => {
  it('parses a real LM4 calibration frame', () => {
    const c = parseCalibration(msg(OPCODE.RES_CAL, hexBytes(REAL_CAL)))!;
    const expected = [1.0352, 1.0451, 0.9688, 1.1088, 1.0389, 1.0539, 1.0674, 1.1947, 1.0];
    c.kSensor.forEach((k, i) => expect(Math.abs(k - expected[i])).toBeLessThan(1e-3));
    expect(c.extra).toHaveLength(2);
    expect(parseCalibration(new Uint8Array(20))).toBeNull();
  });

  it('parses a real LM4 measurement frame', () => {
    const m = parseMeasurement(msg(OPCODE.RES_MEAS, hexBytes(REAL_MEAS)))!;
    expect(m.raw).toEqual([70, 189, 224, 334, 512, 628, 856, 784, 1749]);
    expect(m.aux).toBe(275);
    expect(m.batteryRaw).toBe(3314);
  });

  it('unpacks 12-bit flicker samples, 260 per page and 244 on the last', () => {
    const pack = (s: number[]) => {
      const out: number[] = [];
      for (let i = 0; i < s.length; i += 4) {
        const [a, b, c, d] = s.slice(i, i + 4);
        const w0 = (a << 4) | (b >> 8);
        const w1 = ((b & 0xff) << 8) | (c >> 4);
        const w2 = ((c & 0x0f) << 12) | d;
        out.push(w0 >> 8, w0 & 0xff, w1 >> 8, w1 & 0xff, w2 >> 8, w2 & 0xff);
      }
      return out;
    };
    for (const page of [0, 3]) {
      const n = page === 3 ? 244 : 260;
      const samples = Array.from({ length: n }, (_, i) => (i * 37 + page) & 0xfff);
      const payload = [0, page, 2, ...new Array(22).fill(0), ...pack(samples)];
      const p = parseFlickerPage(msg(OPCODE.RES_FREQ, payload))!;
      expect(p.page).toBe(page);
      expect(p.dataType).toBe(2);
      expect(p.samples).toEqual(samples);
    }
    expect(parseFlickerPage(msg(OPCODE.RES_FREQ, [0, 4, 0, ...new Array(40).fill(0)]))).toBeNull();
  });
});

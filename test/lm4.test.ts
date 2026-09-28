import { describe, expect, it } from 'vitest';
import { lm4Battery, lm4Calibrate, lm4CircadianStimulus, lm4Predict, lm4Process } from '../src/lib/science/lm4';
import { LM4_POLY } from '../src/lib/science/lm4-model-data';
import { cctFromXy, duvFromUv, xyToUv } from '../src/lib/science/colour';

// Real LM4 probe (opple-bridge test vector) with the values the official Opple
// app displayed for the same light: CCT 4236 K, 2057 lx, Ra 96.5, R9 52.2, EML 1680, CS 0.619.
const LM4_K = [1.010141, 1.009422, 0.928753, 1.037585, 0.968898, 1.181077, 0.961893, 1.059147, 1.0];
const LM4_RAW = [654, 819, 855, 1152, 1330, 1719, 2595, 3715, 14571];

describe('LM4 pipeline', () => {
  it('reproduces the official Opple app', () => {
    const r = lm4Process(lm4Calibrate(LM4_RAW, LM4_K));
    expect(Math.abs(r.cct - 4239)).toBeLessThan(1);
    expect(Math.abs(r.lux - 2127.7)).toBeLessThan(0.2);
    expect(Math.abs(r.duv + 0.0136)).toBeLessThan(5e-4);
    expect(Math.abs(r.Ra! - 96.5)).toBeLessThan(1);
    expect(Math.abs(r.R![8] - 52.2)).toBeLessThan(2);
    expect(Math.abs(r.eml! - 1680)).toBeLessThan(150);
    expect(r.R).toHaveLength(14);
  });

  it('matches a real desk-light frame', () => {
    const K = [1.0352, 1.0451, 0.9688, 1.1088, 1.0389, 1.0539, 1.0674, 1.1947, 1.0];
    const r = lm4Process(lm4Calibrate([70, 189, 224, 334, 512, 628, 856, 784, 1749], K));
    expect(Math.abs(r.cct - 4144)).toBeLessThan(3);
    expect(Math.abs(r.lux - 868.8)).toBeLessThan(1);
    expect(Math.abs(r.Ra! - 97.3)).toBeLessThan(0.2);
    expect(Math.abs(r.R![8] - 88.7)).toBeLessThan(0.3);
  });

  it('reproduces the app circadian stimulus exactly', () => {
    // The app's CS at the lux it displayed for this light (2057 lx) is 0.619.
    const m = lm4Predict(lm4Calibrate(LM4_RAW, LM4_K), 4236, 2057)!;
    expect(lm4CircadianStimulus(m.a, m.b, 2057).toFixed(3)).toBe('0.619');
    // Guard against the corrupted public extraction of the circadian coefficients.
    expect(LM4_POLY.A.coef.filter((c) => c !== 0)).toHaveLength(106);
    expect(LM4_POLY.B.coef.filter((c) => c !== 0)).toHaveLength(158);
  });

  it('shows no CRI outside the model domain, as the app', () => {
    const r = lm4Process([0, 0, 0, 0, 0, 0, 0, 5000, 5000]); // deep-red-only
    expect(r.Ra).toBeNull();
    expect(r.R).toBeNull();
  });

  it('runs the model even when CCT is zeroed (saturated colours)', () => {
    // A strongly red source: x > 0.57, so the app zeroes CCT but still runs the CRI model.
    const ch = [10, 10, 10, 15, 60, 600, 2500, 3000, 4000];
    const r = lm4Process(ch);
    expect(r.x).toBeGreaterThan(0.57);
    expect(r.cct).toBe(0);
    expect(r.lux).toBeGreaterThan(0);
    const model = lm4Predict(ch, 0, r.lux);
    expect(r.Ra).toBe(model ? model.Ra : null);
  });

  it('handles darkness', () => {
    const r = lm4Process(new Array(9).fill(0));
    expect(r.lux).toBe(0);
    expect(r.Ra).toBeNull();
  });

  it('maps battery for both firmware tables', () => {
    expect(lm4Battery(3344).percent).toBe(100);
    expect(lm4Battery(3027).percent).toBe(1);
    expect(lm4Battery(1000).mv).toBe(4000);
    expect(lm4Battery(0).percent).toBeNull();
    // The last segment of the Li-ion table (3455..3594 mV) interpolates 1..10 %, truncated.
    expect(lm4Battery(3525 / 4).percent).toBe(5);
    expect(Number.isInteger(lm4Battery(3200).percent)).toBe(true);
  });

  it('bounds circadian stimulus', () => {
    expect(lm4CircadianStimulus(1, 1, 0)).toBe(0);
    const m = lm4Predict(lm4Calibrate(LM4_RAW, LM4_K), 4236, 2057)!;
    const cs = lm4CircadianStimulus(m.a, m.b, 2057);
    expect(cs).toBeGreaterThan(0);
    expect(cs).toBeLessThanOrEqual(0.7);
  });

  it('standard formulas hit known points', () => {
    expect(Math.abs(cctFromXy(0.3127, 0.329) - 6500)).toBeLessThan(40);
    const [u, v] = xyToUv(0.3127, 0.329);
    expect(Math.abs(duvFromUv(u, v) - 0.0032)).toBeLessThan(0.001);
    // Official app screenshot: x 0.3857, y 0.3825 -> u 0.2262, v 0.3366 (CIE 1960).
    const [u2, v2] = xyToUv(0.3857, 0.3825);
    expect(Math.abs(u2 - 0.2262)).toBeLessThan(1.5e-4); // displayed x, y are rounded
    expect(Math.abs(v2 - 0.3366)).toBeLessThan(1.5e-4);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFlickerPage } from '../src/lib/ble/protocol';
import { analyseFlicker, type FlickerPeriod } from '../src/lib/science/flicker';
import { processMeasurement } from '../src/lib/ble/meter';

// Flicker captures from a real Light Master 4 (see the fixture's `source`).
const fx = JSON.parse(readFileSync(new URL('./fixtures/lm4-flicker-captures.json', import.meta.url), 'utf8'));

function load(capture: { period: number; pages: string[]; kSensor: number[] }) {
  const pages = capture.pages.map((h) => parseFlickerPage(Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16))))!);
  const samples = new Array(1024).fill(0);
  for (const p of pages) samples.splice(p.page * 260, p.samples.length, ...p.samples);
  const p3 = pages.find((p) => p.page === 3)!;
  const lux = processMeasurement(p3.measurement, { kSensor: capture.kSensor, extra: [] }).lux;
  return { pages, samples, p3, lux, result: analyseFlicker(samples, p3.dataType, capture.period as FlickerPeriod, lux) };
}

describe('real LM4 flicker captures', () => {
  it('pages carry 260/260/260/244 samples in order, with an embedded measurement', () => {
    const { pages, p3, lux } = load(fx.steady);
    expect(pages.map((p) => [p.page, p.samples.length])).toEqual([
      [0, 260],
      [1, 260],
      [2, 260],
      [3, 244],
    ]);
    expect(p3.dataType).toBe(0);
    expect(lux).toBeGreaterThan(80);
    expect(lux).toBeLessThan(200);
  });

  it('a steady ~120 lx light is weak but valid, and scaled to lux', () => {
    const { result, lux } = load(fx.steady);
    expect(result.quality.status).toBe('weak');
    const mean = result.wave.reduce((a, b) => a + b, 0) / 1024;
    expect(mean).toBeCloseTo(lux, 6);
    expect(result.modulation).toBeLessThan(15);
    expect(result.risk).toBe('none');
  });

  it('an overloaded sensor (~8 500 lx) is flagged instead of trusted', () => {
    const { result } = load(fx.bright);
    expect(result.quality.status).toBe('saturated');
    expect(result.modulation).toBe(99.5); // what the app would show
  });
});

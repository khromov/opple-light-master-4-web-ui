import { describe, expect, it } from 'vitest';
import {
  acCouple,
  analyseFlicker,
  assessRisk,
  binWidthHz,
  flickerIndex,
  magnitudeSpectrum,
  modulationDepth,
  peakBin,
  refineFrequency,
  cubicSmooth7,
  type FlickerPeriod,
} from '../src/lib/science/flicker';

const N = 1024;
// Sample rate implied by the app's bin width (1024 / window ms -> Hz per bin).
const fs = (p: FlickerPeriod) => binWidthHz(p) * N;
const sine = (dc: number, amp: number, f: number, rate: number) =>
  Array.from({ length: N }, (_, i) => dc + amp * Math.sin((2 * Math.PI * f * i) / rate));

// Synthetic cases from opple-bridge's regression tests.
describe('flicker frequency', () => {
  it('finds 5 kHz on period 25', () => {
    const r = analyseFlicker(sine(80, 20, 5000, fs(25)), 2, 25);
    expect(Math.abs(r.frequency - 5000)).toBeLessThan(r.binHz);
  });

  it('finds 28174 Hz on period 11', () => {
    const r = analyseFlicker(sine(80, 20, 28174, fs(11)), 2, 11);
    expect(Math.abs(r.frequency - 28174)).toBeLessThan(r.binHz);
  });

  it('finds low-modulation 100 Hz on period 25 within two bins', () => {
    const r = analyseFlicker(sine(25, 1, 100, fs(25)), 2, 25);
    expect(Math.abs(r.frequency - 100)).toBeLessThan(2 * r.binHz);
  });

  it('DC at the baseline has no spectral energy', () => {
    const wave = acCouple(new Array(N).fill(13.8447265625), 2);
    expect(Math.max(...magnitudeSpectrum(wave))).toBeLessThan(1e-9);
  });

  it('FFT matches a direct DFT', () => {
    const wave = Array.from({ length: N }, (_, i) => Math.abs(Math.sin(i * 0.37)) * 100 + (i % 7));
    const fast = magnitudeSpectrum(wave);
    for (const k of [0, 1, 17, 200, 511]) {
      let re = 0;
      let im = 0;
      for (let t = 0; t < N; t++) {
        re += wave[t] * Math.cos((-2 * Math.PI * k * t) / N);
        im += wave[t] * Math.sin((-2 * Math.PI * k * t) / N);
      }
      expect(fast[k]).toBeCloseTo(Math.hypot(re, im) / N, 9);
    }
    expect(peakBin(fast)).toBeGreaterThan(0);
  });
});

describe('flicker metrics', () => {
  it('full square wave is ~99.5% modulation and FI 0.5', () => {
    const wave = Array.from({ length: N }, (_, i) => (Math.floor(i / 32) % 2 ? 1000 : 0));
    expect(modulationDepth(wave)).toBe(99.5);
    expect(flickerIndex(wave)).toBeCloseTo(0.5, 6); // wave[0] is 0 here, so the app's quirk doesn't show
  });

  it('1% sine is low', () => {
    const r = analyseFlicker(sine(1000, 10, 1000, fs(25)), 0, 25);
    expect(r.modulation).toBeLessThan(3);
    expect(r.flickerIndex).toBeLessThan(0.05);
  });

  it('steady light reports no modulation and flags DC', () => {
    const r = analyseFlicker(new Array(N).fill(800), 1, 25, 500);
    expect(r.modulation).toBe(0);
    expect(r.isDC).toBe(true);
    expect(r.risk).toBe('none');
  });

  it('scales the waveform to the capture lux', () => {
    const r = analyseFlicker(sine(400, 100, 100, fs(146)), 0, 146, 250);
    const mean = r.wave.reduce((a, b) => a + b, 0) / N;
    expect(mean).toBeCloseTo(250, 6);
    expect(r.isDC).toBe(false);
  });

  it('classifies risk like the app getFreqConclusion', () => {
    expect(assessRisk(100, 3)).toBe('none'); // low above 3.5
    expect(assessRisk(100, 5)).toBe('low'); // high above 8
    expect(assessRisk(100, 20)).toBe('high');
    expect(assessRisk(5, 0.5)).toBe('low'); // below 10 Hz: 0.35 / 0.8
    expect(assessRisk(5, 0.9)).toBe('high');
    expect(assessRisk(1000, 90)).toBe('high');
    expect(assessRisk(2850, 99)).toBe('none');
  });

  it('refines frequency with the second capture like the app', () => {
    const base = analyseFlicker(sine(500, 200, 100, fs(25)), 0, 25);
    const fine = analyseFlicker(sine(500, 200, 100, fs(146)), 0, 146);
    const r = refineFrequency(base, fine);
    expect(r.modulation).toBe(base.modulation);
    expect(Math.abs(r.frequency - 100)).toBeLessThan(fine.binHz);
    expect(r.captures).toEqual([25, 146]);
    expect(cubicSmooth7([1, 2, 3])).toEqual([1, 2, 3]);
    const hi = analyseFlicker(sine(500, 200, 20000, fs(11)), 0, 11);
    expect(refineFrequency(base, hi).frequency).toBe(hi.frequency);
  });
});

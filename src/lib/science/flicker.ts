// Flicker analysis for the Light Master 4's 1024-sample photodiode capture.
//
// Mirrors the official app's `dealFreqMeasureData` / `getFreqConclusion`
// (OPPLE Smart iOS 3.16.0, cross-checked with gabrielebaudo/opple-bridge,
// MIT, Copyright (c) 2026 Gabriele Baudo):
//   1. Subtract the gain-range ADC baseline, clip negatives, scale to lux.
//   2. Modulation depth: (mean of largest 30 - mean of smallest 30) / (sum) x 100, capped at 99.5.
//   3. Flicker index: area above the mean / total area.
//   4. Frequency: strongest bin (excluding DC) of an unwindowed 1024-point FFT x 1024 / period.

/** Sampling modes: request parameter -> the app's period factor (µs per sample, as the app treats it). */
export const FLICKER_MODES = {
  25: 26.0,
  146: 150.0,
  11: 12.285,
} as const;

export type FlickerPeriod = keyof typeof FLICKER_MODES;

const DC_OFFSETS: Record<number, number> = { 0: 29.7412109375, 1: 15.8720703125 };
const DC_OFFSET_DEFAULT = 13.8447265625;

export function dcOffset(dataType: number): number {
  return DC_OFFSETS[dataType] ?? DC_OFFSET_DEFAULT;
}

export function acCouple(samples: number[], dataType: number): number[] {
  const dc = dcOffset(dataType);
  return samples.map((s) => (s > dc ? s - dc : 0));
}

/** Percent flicker ("modulation depth"), 0..99.5, on AC-coupled samples. */
export function modulationDepth(wave: number[]): number {
  if (wave.length < 60) return 0;
  if (Math.max(...wave) <= 0) return 0;
  const sorted = wave.slice().sort((a, b) => a - b);
  const n = 30;
  const lo = sorted.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const hi = sorted.slice(-n).reduce((a, b) => a + b, 0) / n;
  const den = hi + lo;
  if (den <= 0) return 0;
  return Math.min(99.5, Math.max(0, ((hi - lo) / den) * 100));
}

/**
 * IES flicker index (area above the mean / total area), 0..1.
 * The app's `reduce` has no initial value, so its sum starts from the first
 * sample itself rather than its excess over the mean; kept for parity
 * (it adds about wave[0] / total, ~0.001 for steady light).
 */
export function flickerIndex(wave: number[]): number {
  if (wave.length === 0) return 0;
  const total = wave.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const mean = total / wave.length;
  let above = wave[0];
  for (let i = 1; i < wave.length; i++) if (wave[i] > mean) above += wave[i] - mean;
  return above / total;
}

/** |X_k| / N for k = 0..N/2-1 (radix-2 FFT, no window, no mean removal - as the app does). */
export function magnitudeSpectrum(wave: number[]): number[] {
  let n = 1;
  while (n < wave.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(wave);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  const half = n / 2;
  const out = new Array<number>(half);
  for (let k = 0; k < half; k++) out[k] = Math.hypot(re[k], im[k]) / wave.length;
  return out;
}

/** Hz per FFT bin for a sampling period, as the app computes it. */
export function binWidthHz(period: FlickerPeriod): number {
  return 1024 / FLICKER_MODES[period];
}

/**
 * The app's peak search: the largest magnitude above DC, located with
 * `indexOf` over the whole spectrum - so a flat capture (peak equal to the
 * DC bin, e.g. in darkness) resolves to bin 0 and reports 0 Hz.
 */
export function peakBin(spectrum: number[]): number {
  if (spectrum.length < 2) return 0;
  let peak = -Infinity;
  for (let k = 1; k < spectrum.length; k++) if (spectrum[k] > peak) peak = spectrum[k];
  return spectrum.indexOf(peak);
}

export type FlickerRisk = 'none' | 'low' | 'high';

/**
 * IEEE PAR1789-style classification exactly as the app's `getFreqConclusion`:
 * below 10 Hz high above 0.8 %, low above 0.35 %; from 10 Hz to 2850 Hz high
 * above 0.08·f, low above 0.035·f; 2850 Hz and up is always no risk.
 */
export function assessRisk(frequencyHz: number, modulationPct: number): FlickerRisk {
  const f = frequencyHz;
  const d = modulationPct;
  if (f >= 2850) return 'none';
  const [high, low] = f < 10 ? [0.8, 0.35] : [0.08 * f, 0.035 * f];
  if (d > high) return 'high';
  if (d > low) return 'low';
  return 'none';
}

/** Boundaries as drawn on the app's IEEE PAR1789 chart (modulation % vs Hz). */
export const chartNoRiskLimit = (f: number) => 0.0333 * Math.max(f, 8.7);
export const chartLowRiskLimit = (f: number) => 0.08 * Math.max(f, 10);

/** 7-point cubic Savitzky-Golay smoothing (the app's `cubicSmooth7`), negatives clamped to 0. */
export function cubicSmooth7(a: number[]): number[] {
  const n = a.length;
  if (n < 7) return a.slice();
  const o = new Array<number>(n);
  o[0] = (39 * a[0] + 8 * a[1] - 4 * a[2] - 4 * a[3] + a[4] + 4 * a[5] - 2 * a[6]) / 42;
  o[1] = (8 * a[0] + 19 * a[1] + 16 * a[2] + 6 * a[3] - 4 * a[4] - 7 * a[5] + 4 * a[6]) / 42;
  o[2] = (-4 * a[0] + 16 * a[1] + 19 * a[2] + 12 * a[3] + 2 * a[4] - 4 * a[5] + a[6]) / 42;
  for (let i = 3; i <= n - 4; i++) {
    o[i] = (-2 * (a[i - 3] + a[i + 3]) + 3 * (a[i - 2] + a[i + 2]) + 6 * (a[i - 1] + a[i + 1]) + 7 * a[i]) / 21;
  }
  o[n - 3] = (-4 * a[n - 1] + 16 * a[n - 2] + 19 * a[n - 3] + 12 * a[n - 4] + 2 * a[n - 5] - 4 * a[n - 6] + a[n - 7]) / 42;
  o[n - 2] = (8 * a[n - 1] + 19 * a[n - 2] + 16 * a[n - 3] + 6 * a[n - 4] - 4 * a[n - 5] - 7 * a[n - 6] + 4 * a[n - 7]) / 42;
  o[n - 1] = (39 * a[n - 1] + 8 * a[n - 2] - 4 * a[n - 3] - 4 * a[n - 4] + a[n - 5] + 4 * a[n - 6] - 2 * a[n - 7]) / 42;
  return o.map((v) => Math.max(0, v));
}

export type SignalStatus = 'ok' | 'weak' | 'too-dim' | 'saturated';

export interface SignalQuality {
  status: SignalStatus;
  /** Mean ADC counts above the dark baseline (of ~4080 usable). */
  level: number;
}

/**
 * How usable a capture is. Measured on a real LM4: the flicker photodiode
 * sits only ~55 counts above its dark level at ~120 lx, and in bright light
 * (≳ 8 000 lx) it overloads and reads back at the dark level, which the
 * app's maths turns into a meaningless 99.5 % modulation. The app has an
 * "increase the test distance" message but never raises it for the LM4.
 */
export function signalQuality(samples: number[], dataType: number, lux: number | null): SignalQuality {
  const dc = dcOffset(dataType);
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  const level = mean - dc;
  const clipped = samples.some((v) => v >= 4090);
  if (clipped) return { status: 'saturated', level };
  if (level < 8) return { status: lux !== null && lux > 1000 ? 'saturated' : 'too-dim', level };
  if (level < 150) return { status: 'weak', level };
  return { status: 'ok', level };
}

export interface FlickerResult {
  period: FlickerPeriod;
  dataType: number;
  /** Raw 12-bit samples as captured. */
  samples: number[];
  /** Baseline-subtracted waveform, scaled to lux when the capture's lux is known. */
  wave: number[];
  /** Lux of the measurement embedded in the capture (null if unknown). */
  lux: number | null;
  /** Nominal µs per sample (the app's period factor). */
  sampleIntervalUs: number;
  spectrum: number[];
  binHz: number;
  frequency: number;
  modulation: number;
  flickerIndex: number;
  /** The app's DC flag: peak below 0.2 % of the DC component (steady light; frequency is noise). */
  isDC: boolean;
  /** Set when the app's frequency-refining second capture failed (the app shows an error instead). */
  refineError?: string;
  risk: FlickerRisk;
  /** Periods captured to produce this result (the app refines frequency with a second capture). */
  captures: FlickerPeriod[];
  /** Whether the photodiode signal is usable (not part of the app). */
  quality: SignalQuality;
}

export function analyseFlicker(samples: number[], dataType: number, period: FlickerPeriod, lux: number | null = null): FlickerResult {
  let wave = acCouple(samples, dataType);
  const mean = wave.reduce((a, b) => a + b, 0) / wave.length;
  if (lux !== null && Number.isFinite(lux) && mean !== 0) {
    const k = lux / mean;
    wave = wave.map((v) => v * k);
  }
  const spectrum = magnitudeSpectrum(wave);
  const binHz = binWidthHz(period);
  const bin = peakBin(spectrum);
  const frequency = (bin * 1024) / FLICKER_MODES[period];
  const modulation = modulationDepth(wave);
  return {
    period,
    dataType,
    samples,
    wave,
    lux,
    sampleIntervalUs: FLICKER_MODES[period],
    spectrum,
    binHz,
    frequency,
    modulation,
    flickerIndex: flickerIndex(wave),
    isDC: spectrum[bin] / spectrum[0] < 0.002,
    risk: assessRisk(frequency, modulation),
    captures: [period],
    quality: signalQuality(samples, dataType, lux),
  };
}

/**
 * Combine the app's two-stage capture: modulation depth and flicker index
 * always come from the 26 µs capture; the frequency is refined by the
 * 150 µs capture (≤ 2 kHz, waveform then smoothed) or replaced by the
 * 12.285 µs capture when that one sees more than 15 kHz.
 */
export function refineFrequency(base: FlickerResult, second: Pick<FlickerResult, 'period' | 'frequency'> | null): FlickerResult {
  if (!second) return base;
  if (second.period === 146) {
    return {
      ...base,
      frequency: second.frequency,
      risk: assessRisk(second.frequency, base.modulation),
      wave: cubicSmooth7(base.wave),
      captures: [base.period, second.period],
    };
  }
  if (second.period === 11 && second.frequency > 15000) {
    return { ...base, frequency: second.frequency, risk: assessRisk(second.frequency, base.modulation), captures: [base.period, second.period] };
  }
  return { ...base, captures: [base.period, second.period] };
}

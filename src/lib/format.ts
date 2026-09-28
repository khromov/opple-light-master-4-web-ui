// Display formatting, mirroring the official app's `dealResData` (Photometry)
// and the Flicker tab: same validity windows, same decimals, '---' for
// values the app hides.

import type { Reading } from './ble/meter';
import type { FlickerResult, FlickerRisk } from './science/flicker';

export const NONE = '---';

export interface PhotometryView {
  /** False when lux is below 10 or at/above 50 000 lx: the app blanks every other value. */
  valid: boolean;
  lux: string;
  cct: string;
  x: string;
  y: string;
  u: string;
  v: string;
  duv: string;
  ra: string;
  cs: string;
  eml: string;
  r9: string;
  /** R1..R14 as shown in the table (app rules: '0.0' without data, '--' outside 0..100, R9 then follows `r9`). */
  rs: string[];
  /** R1..R14 as plotted (values outside -100..100 drawn as 0). */
  rBars: number[];
}

export function formatPhotometry(r: Reading | null): PhotometryView {
  const empty: PhotometryView = {
    valid: false,
    lux: NONE,
    cct: NONE,
    x: NONE,
    y: NONE,
    u: NONE,
    v: NONE,
    duv: NONE,
    ra: NONE,
    cs: NONE,
    eml: NONE,
    r9: NONE,
    rs: new Array(14).fill('0.0'),
    rBars: new Array(14).fill(0),
  };
  if (!r) return empty;
  const lux = Math.min(Math.trunc(r.lux), 50000);
  if (lux >= 50000 || lux < 10) return { ...empty, lux: String(lux) };
  const cctInt = Math.trunc(r.cct);
  const view: PhotometryView = {
    ...empty,
    valid: true,
    lux: String(lux),
    cct: cctInt < 1500 || cctInt > 25000 ? NONE : String(cctInt),
    x: r.x.toFixed(4),
    y: r.y.toFixed(4),
    u: r.u.toFixed(4),
    v: r.v.toFixed(4),
    duv: r.duv ? r.duv.toFixed(4) : NONE,
  };
  if (r.Ra) {
    view.ra = r.Ra < 50 || r.Ra > 100 ? NONE : r.Ra.toFixed(1);
    view.cs = r.cs === null || r.cs < 0 ? NONE : r.cs.toFixed(3);
    view.eml = r.eml === null || r.eml < 0 ? NONE : r.eml.toFixed(0);
    // The app tests `if (raw.r9)`, so an R9 of exactly 0 is also '---'.
    const r9 = r.R?.[8];
    view.r9 = !r9 || r9 > 100 ? NONE : r9.toFixed(1);
  }
  // Without model output the app's table shows 0.0 (its default is Array(14).fill(0)).
  const rs = r.R ?? new Array<number>(14).fill(0);
  // The app compares the formatted string, so -0.04 shows "-0.0"; out-of-range cells
  // show '--', except R9 which then shows the R9 card's text.
  view.rs = rs.map((v, i) => {
    const text = v.toFixed(1);
    const n = Number(text);
    return n < 0 || n > 100 ? (i === 8 ? view.r9 : '--') : text;
  });
  view.rBars = rs.map((v) => (v < -100 || v > 100 ? 0 : v));
  return view;
}

export interface FlickerView {
  flickerIndex: string;
  modulation: string;
  frequency: string;
  risk: FlickerRisk | null;
  max: string;
  min: string;
  avg: string;
}

export function formatFlicker(f: FlickerResult | null): FlickerView {
  if (!f) return { flickerIndex: NONE, modulation: NONE, frequency: NONE, risk: null, max: '--', min: '--', avg: '--' };
  const stat = (v: number) => (v ? v.toFixed(0) : '--');
  const wave = f.wave;
  const max = wave.reduce((a, b) => Math.max(a, b), -Infinity);
  const min = wave.reduce((a, b) => Math.min(a, b), Infinity);
  const avg = wave.reduce((a, b) => a + b, 0) / wave.length;
  return {
    flickerIndex: f.flickerIndex.toFixed(4),
    modulation: `${f.modulation.toFixed(2)}%`,
    frequency: f.frequency.toFixed(0),
    risk: f.risk,
    max: stat(max),
    min: stat(min),
    avg: stat(avg),
  };
}

export const RISK_LABEL: Record<FlickerRisk, string> = { none: 'No Risk', low: 'Low Risk', high: 'High Risk' };

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

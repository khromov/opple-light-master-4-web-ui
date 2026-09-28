// Saved reports. The official app uploads {basicData, strobeData} to Opple's
// cloud and shares a link. Here reports live in IndexedDB on this device, can
// be exported as CSV/JSON, and are shared as self-contained links.
//
// Reports keep the meter's raw inputs (channel counts, calibration, flicker
// samples) and are recomputed when opened, so a saved report always shows
// what the current algorithms make of the original measurement.

import { createStore, del, entries, get, set } from 'idb-keyval';
import { processMeasurement, type Reading } from './ble/meter';
import { analyseFlicker, refineFrequency, type FlickerPeriod, type FlickerResult } from './science/flicker';

export interface Report {
  id: string;
  title: string;
  createdAt: number;
  device: string | null;
  reading: Reading;
  flicker: FlickerResult | null;
}

/** What is stored and exported: raw meter inputs only. */
export interface StoredReport {
  v: 2;
  id: string;
  title: string;
  createdAt: number;
  device: string | null;
  measurement: { raw: number[]; kSensor: number[] | null; batteryRaw: number; aux: number };
  flicker: {
    samples: number[];
    dataType: number;
    period: FlickerPeriod;
    lux: number | null;
    /** The app's frequency-refining capture, if it ran. */
    second: { period: FlickerPeriod; frequency: number } | null;
    refineError?: string;
  } | null;
}

const store = typeof indexedDB !== 'undefined' ? createStore('lm4-web', 'reports') : undefined;

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function toStored(r: Pick<Report, 'id' | 'title' | 'createdAt' | 'device' | 'reading' | 'flicker'>): StoredReport {
  const m = r.reading;
  const f = r.flicker;
  return {
    v: 2,
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    device: r.device,
    measurement: { raw: [...m.raw], kSensor: m.kSensor ? [...m.kSensor] : null, batteryRaw: m.batteryRaw, aux: m.aux ?? 0 },
    flicker: f
      ? {
          samples: [...f.samples],
          dataType: f.dataType,
          period: f.period,
          lux: f.lux,
          second: f.captures.length > 1 ? { period: f.captures[1], frequency: f.frequency } : null,
          ...(f.refineError ? { refineError: f.refineError } : {}),
        }
      : null,
  };
}

/** Recompute a report from its raw inputs. Also accepts the earlier format that stored processed objects. */
export function fromStored(input: unknown): Report {
  const s = input as Record<string, any>;
  if (!s || typeof s.id !== 'string') throw new Error('Not a report');
  let stored: StoredReport;
  if (s.v === 2) stored = s as StoredReport;
  else if (s.reading && Array.isArray(s.reading.raw)) {
    const f = s.flicker;
    stored = {
      v: 2,
      id: s.id,
      title: String(s.title ?? 'Report'),
      createdAt: Number(s.createdAt) || Date.now(),
      device: s.device ?? null,
      measurement: { raw: s.reading.raw, kSensor: s.reading.kSensor ?? null, batteryRaw: s.reading.batteryRaw ?? 0, aux: s.reading.aux ?? 0 },
      flicker:
        f && Array.isArray(f.samples)
          ? { samples: f.samples, dataType: f.dataType, period: f.period, lux: f.lux ?? null, second: f.captures?.length > 1 ? { period: f.captures[1], frequency: f.frequency } : null }
          : null,
    };
  } else throw new Error('Unrecognised report format');

  const m = stored.measurement;
  const reading: Reading = { ...processMeasurement(m, m.kSensor ? { kSensor: m.kSensor, extra: [] } : null), ts: stored.createdAt };
  let flicker: FlickerResult | null = null;
  if (stored.flicker) {
    const f = stored.flicker;
    const base = analyseFlicker(f.samples, f.dataType, f.period, f.lux);
    flicker = f.refineError ? { ...base, refineError: f.refineError } : refineFrequency(base, f.second);
  }
  return { id: stored.id, title: stored.title, createdAt: stored.createdAt, device: stored.device, reading, flicker };
}

export async function saveReport(report: Report): Promise<void> {
  await set(report.id, toStored(report), store);
}

export async function listReports(): Promise<Report[]> {
  const all = await entries<string, unknown>(store);
  const out: Report[] = [];
  for (const [, v] of all) {
    try {
      out.push(fromStored(v));
    } catch {
      // skip unreadable entries
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getReport(id: string): Promise<Report | undefined> {
  const v = await get(id, store);
  return v ? fromStored(v) : undefined;
}

export const deleteReport = (id: string) => del(id, store);

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  // Keep spreadsheets from evaluating text cells (titles) as formulas.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportsToCsv(reports: Report[]): string {
  const head = [
    'title',
    'time',
    'device',
    'lux',
    'cct_K',
    'x',
    'y',
    'u',
    'v',
    'duv',
    'Ra',
    ...Array.from({ length: 14 }, (_, i) => `R${i + 1}`),
    'CS',
    'EML',
    'flicker_index',
    'modulation_pct',
    'frequency_Hz',
    'flicker_risk',
    'battery_pct',
    ...Array.from({ length: 9 }, (_, i) => (i < 8 ? `raw_F${i + 1}` : 'raw_clear')),
    'raw_aux',
  ];
  const rows = reports.map((r) => {
    const m = r.reading;
    const f = r.flicker;
    return [
      r.title,
      new Date(r.createdAt).toISOString(),
      r.device,
      m.lux,
      m.cct,
      m.x,
      m.y,
      m.u,
      m.v,
      m.duv,
      m.Ra,
      ...Array.from({ length: 14 }, (_, i) => m.R?.[i] ?? null),
      m.cs,
      m.eml,
      f?.flickerIndex ?? null,
      f?.modulation ?? null,
      f?.frequency ?? null,
      f?.risk ?? null,
      m.battery.percent,
      ...m.raw,
      m.aux,
    ];
  });
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function download(filename: string, content: string | Blob, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportsToJson(reports: Report[]): string {
  return JSON.stringify({ format: 'lm4-web-reports', version: 2, reports: reports.map(toStored) }, null, 1);
}

export async function importReports(json: string): Promise<number> {
  const data = JSON.parse(json);
  const list: unknown[] = Array.isArray(data) ? data : data?.reports;
  if (!Array.isArray(list)) throw new Error('Not a reports file');
  let n = 0;
  for (const item of list) {
    try {
      const r = fromStored(item);
      await saveReport(r);
      n++;
    } catch {
      // skip entries that aren't reports
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Share links: the stored form, deflated into the URL fragment
// ---------------------------------------------------------------------------

const MAX_SHARE_CODE = 64 * 1024;

function toB64u(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function pack12(samples: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil((samples.length * 3) / 2));
  for (let i = 0, o = 0; i < samples.length; i += 2, o += 3) {
    const a = samples[i] & 0xfff;
    const b = (samples[i + 1] ?? 0) & 0xfff;
    out[o] = a >> 4;
    out[o + 1] = ((a & 0xf) << 4) | (b >> 8);
    out[o + 2] = b & 0xff;
  }
  return out;
}

function unpack12(bytes: Uint8Array, n: number): number[] {
  const out: number[] = [];
  for (let o = 0; out.length < n; o += 3) {
    out.push((bytes[o] << 4) | (bytes[o + 1] >> 4));
    if (out.length < n) out.push(((bytes[o + 1] & 0xf) << 8) | bytes[o + 2]);
  }
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function shareLink(r: Report): Promise<string> {
  const stored = toStored(r);
  const payload = {
    ...stored,
    id: undefined,
    flicker: stored.flicker ? { ...stored.flicker, samples: toB64u(pack12(stored.flicker.samples)) } : null,
  };
  const bytes = await deflate(new TextEncoder().encode(JSON.stringify(payload)));
  // Built from the page path only, so query flags such as ?demo don't travel with the link.
  return `${location.origin}${location.pathname}#/shared/${toB64u(bytes)}`;
}

export async function reportFromShare(code: string): Promise<Report> {
  if (code.length > MAX_SHARE_CODE) throw new Error('link too long');
  const p = JSON.parse(new TextDecoder().decode(await inflate(fromB64u(code))));
  if (p?.v !== 2) throw new Error('unsupported link version');
  if (p.flicker) p.flicker.samples = unpack12(fromB64u(p.flicker.samples), 1024);
  return fromStored({ ...p, id: `shared-${p.createdAt}` });
}

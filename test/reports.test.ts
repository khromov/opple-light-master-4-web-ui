import { describe, expect, it } from 'vitest';
import { processMeasurement } from '../src/lib/ble/meter';
import { analyseFlicker, refineFrequency } from '../src/lib/science/flicker';
import { fromStored, reportFromShare, reportsToCsv, shareLink, toStored, type Report } from '../src/lib/reports';
import { formatFlicker, formatPhotometry } from '../src/lib/format';

const K = [1.010141, 1.009422, 0.928753, 1.037585, 0.968898, 1.181077, 0.961893, 1.059147, 1.0];
const reading = processMeasurement({ raw: [654, 819, 855, 1152, 1330, 1719, 2595, 3715, 14571], batteryRaw: 3314, aux: 275 }, { kSensor: K, extra: [] });
const samples = Array.from({ length: 1024 }, (_, i) => Math.round(600 + 80 * Math.sin((2 * Math.PI * 100 * i * 26) / 1e6)));
const base = analyseFlicker(samples, 1, 25, 800);
const fine = analyseFlicker(samples, 1, 146, 800);
const report: Report = { id: 'r1', title: '=Kitchen', createdAt: 1790000000000, device: 'SigMesh', reading, flicker: refineFrequency(base, fine) };

describe('reports', () => {
  it('store raw inputs and recompute the same displayed values', () => {
    const stored = JSON.parse(JSON.stringify(toStored(report)));
    const back = fromStored(stored);
    expect(formatPhotometry(back.reading)).toEqual(formatPhotometry(report.reading));
    expect(formatFlicker(back.flicker)).toEqual(formatFlicker(report.flicker));
    expect(back.flicker!.captures).toEqual([25, 146]);
    expect(back.flicker!.wave).toEqual(report.flicker!.wave); // smoothed as after the 150 µs capture
  });

  it('read the earlier processed-object format', () => {
    const legacy = JSON.parse(JSON.stringify({ ...report, reading: { ...reading, temperature: 27.5 } }));
    expect(formatPhotometry(fromStored(legacy).reading)).toEqual(formatPhotometry(reading));
  });

  it('share links round-trip and drop query flags', async () => {
    (globalThis as any).location = { origin: 'https://example.github.io', pathname: '/lm4/', href: 'https://example.github.io/lm4/?demo#/' };
    const link = await shareLink(report);
    expect(link.startsWith('https://example.github.io/lm4/#/shared/')).toBe(true);
    const back = await reportFromShare(link.split('#/shared/')[1]);
    expect(back.title).toBe('=Kitchen');
    expect(formatPhotometry(back.reading)).toEqual(formatPhotometry(reading));
    expect(formatFlicker(back.flicker)).toEqual(formatFlicker(report.flicker));
  });

  it('CSV escapes formula-like titles', () => {
    const csv = reportsToCsv([report]);
    expect(csv.split('\n')[1].startsWith("'=Kitchen,")).toBe(true);
  });
});

// Minimal scales and tick generation for the SVG charts.

export type Scale = ((v: number) => number) & { invert: (px: number) => number; domain: [number, number]; range: [number, number] };

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  f.domain = domain;
  f.range = range;
  return f;
}

export function log10(domain: [number, number], range: [number, number]): Scale {
  const l = linear([Math.log10(domain[0]), Math.log10(domain[1])], range);
  const f = ((v: number) => l(Math.log10(Math.max(v, 1e-12)))) as Scale;
  f.invert = (px: number) => 10 ** l.invert(px);
  f.domain = domain;
  f.range = range;
  return f;
}

/** Round tick values covering [min, max] with about `count` steps. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Nice upper bound for a positive maximum. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * mag >= max) ?? 10) * mag;
}

export const fmtNum = (v: number, digits = 0) =>
  v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Compact label for log axes: 3, 10, 100, 1k, 10k. */
export const fmtCompact = (v: number) => (v >= 1000 ? `${fmtNum(v / 1000, v % 1000 ? 1 : 0)}k` : String(v));

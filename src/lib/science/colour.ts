// Colorimetry: chromaticity, CCT, Duv, tint and display helpers.
//
// Standard formulas: McCamy 1992 (CCT), Ohno 2014 / ANSI C78.377 (Duv),
// Adobe DNG (tint). Ported from sunday-light-meter (MIT, Copyright (c) 2026
// Sunday Light).

import { CMF_1931_2DEG, TINT_TABLE, N_WL, WL_START, WL_STEP } from './cie-data';

export type Vec3 = [number, number, number];

export function xyzToXy(X: number, Y: number, Z: number): [number, number] {
  const s = X + Y + Z;
  return s === 0 ? [0, 0] : [X / s, Y / s];
}

/** CIE 1931 xy -> CIE 1960 UCS (u, v). Duv is defined in this space; the official app shows these as "u, v". */
export function xyToUv(x: number, y: number): [number, number] {
  const d = -2 * x + 12 * y + 3;
  return [(4 * x) / d, (6 * y) / d];
}

/** CIE 1931 xy -> CIE 1976 UCS (u', v'). */
export function xyToUpVp(x: number, y: number): [number, number] {
  const d = -2 * x + 12 * y + 3;
  return [(4 * x) / d, (9 * y) / d];
}

export function uvToXy(u: number, v: number): [number, number] {
  const d = 2 * u - 8 * v + 4;
  return [(3 * u) / d, (2 * v) / d];
}

/** McCamy CCT. The official app uses 5520 as the constant term (McCamy's paper: 5520.33). */
export function cctFromXy(x: number, y: number): number {
  if (y === 0.1858) return NaN;
  const n = (x - 0.332) / (0.1858 - y);
  return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520;
}

const DUV_K = [-0.471106, 1.925865, -2.4243787, 1.5317403, -0.5179722, 0.0893944, -0.00616793];

/** Signed distance from the Planckian locus in CIE 1960 uv. Positive = above (green), negative = below (magenta). */
export function duvFromUv(u: number, v: number): number {
  const lfp = Math.hypot(u - 0.292, v - 0.24);
  if (lfp === 0) return 0;
  const a = Math.acos((u - 0.292) / lfp);
  let lbb = 0;
  for (let i = 0; i < 7; i++) lbb += DUV_K[i] * a ** i;
  return lfp - lbb;
}

const TINT_SCALE = -3000.0;

/** DNG-style tint: walk along the Wyszecki & Stiles Planckian table. */
export function tintFromXy(x: number, y: number): { temperature: number; tint: number } {
  const u = (2.0 * x) / (1.5 - x + 6.0 * y);
  const v = (3.0 * y) / (1.5 - x + 6.0 * y);
  let temperature = NaN;
  let tint = NaN;
  let lastDt = 0;
  let lastDv = 0;
  let lastDu = 0;
  for (let i = 1; i <= 30; i++) {
    let du = 1.0;
    let dv = TINT_TABLE[i][3];
    let len = Math.sqrt(1.0 + dv * dv);
    du /= len;
    dv /= len;
    let uu = u - TINT_TABLE[i][1];
    let vv = v - TINT_TABLE[i][2];
    let dt = -uu * dv + vv * du;
    if (dt <= 0.0 || i === 30) {
      if (dt > 0.0) dt = 0.0;
      dt = -dt;
      const f = i === 1 ? 0.0 : dt / (lastDt + dt);
      temperature = 1.0e6 / (TINT_TABLE[i - 1][0] * f + TINT_TABLE[i][0] * (1.0 - f));
      uu = u - (TINT_TABLE[i - 1][1] * f + TINT_TABLE[i][1] * (1.0 - f));
      vv = v - (TINT_TABLE[i - 1][2] * f + TINT_TABLE[i][2] * (1.0 - f));
      du = du * (1.0 - f) + lastDu * f;
      dv = dv * (1.0 - f) + lastDv * f;
      len = Math.sqrt(du * du + dv * dv);
      du /= len;
      dv /= len;
      tint = (uu * du + vv * dv) * TINT_SCALE;
      break;
    }
    lastDt = dt;
    lastDu = du;
    lastDv = dv;
  }
  return { temperature, tint };
}

/** Wavelength (nm) of grid index i on the 380..780 nm, 5 nm grid. */
export const gridWavelength = (i: number) => WL_START + WL_STEP * i;

/** Tristimulus values of an SPD on the 5 nm grid, scaled so Y = 100. */
export function spdToXyz(spd: number[]): Vec3 {
  let xs = 0;
  let ys = 0;
  let zs = 0;
  for (let i = 0; i < spd.length; i++) {
    xs += spd[i] * CMF_1931_2DEG[i * 3];
    ys += spd[i] * CMF_1931_2DEG[i * 3 + 1];
    zs += spd[i] * CMF_1931_2DEG[i * 3 + 2];
  }
  return [(100 * xs) / ys, 100, (100 * zs) / ys];
}

/** Blackbody spectral radiance on the 5 nm grid (relative). */
export function spdOfPlanck(cct: number): number[] {
  const out = new Array<number>(N_WL);
  for (let i = 0; i < N_WL; i++) {
    const wl = gridWavelength(i) * 1e-9;
    out[i] = 1.191027e-16 / (wl ** 5 * (Math.exp(0.0143876 / (wl * cct)) - 1));
  }
  return out;
}

/** Approximate sRGB of a blackbody at `kelvin` (Tanner Helland fit), as a CSS colour. */
export function cctToCss(kelvin: number): string {
  const k = Math.min(12000, Math.max(1200, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (k - 60) ** -0.1332047592;
    g = 288.1221695283 * (k - 60) ** -0.0755148492;
    b = 255;
  }
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

/** Approximate sRGB of a visible wavelength (nm), for spectrum colouring. */
export function wavelengthToCss(nm: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else if (nm <= 780) {
    r = 1;
  }
  let f = 1;
  if (nm < 420) f = 0.3 + (0.7 * (nm - 380)) / 40;
  else if (nm > 700) f = 0.3 + (0.7 * (780 - nm)) / 80;
  const c = (v: number) => Math.round(255 * (v * f) ** 0.8);
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

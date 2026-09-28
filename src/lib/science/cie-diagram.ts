// Geometry for the CIE 1931 xy chromaticity diagram: spectral locus,
// Planckian locus and an sRGB rendering of the gamut.

import { CMF_1931_2DEG, N_WL } from './cie-data';
import { gridWavelength, spdOfPlanck, spdToXyz, xyzToXy } from './colour';

export type XY = [number, number];

/** Spectral locus, 380..700 nm (beyond 700 nm the locus is a single point). */
export const SPECTRAL_LOCUS: { nm: number; xy: XY }[] = (() => {
  const out: { nm: number; xy: XY }[] = [];
  for (let i = 0; i < N_WL; i++) {
    const nm = gridWavelength(i);
    if (nm > 700) break;
    const X = CMF_1931_2DEG[i * 3];
    const Y = CMF_1931_2DEG[i * 3 + 1];
    const Z = CMF_1931_2DEG[i * 3 + 2];
    if (X + Y + Z === 0) continue;
    out.push({ nm, xy: xyzToXy(X, Y, Z) });
  }
  return out;
})();

export function planckXy(cct: number): XY {
  return xyzToXy(...spdToXyz(spdOfPlanck(cct)));
}

/** Planckian locus from 1000 K to 25 000 K (mired-spaced so the curve is smooth). */
export const PLANCKIAN_LOCUS: XY[] = (() => {
  const out: XY[] = [];
  for (let mired = 1000; mired >= 40; mired -= 10) out.push(planckXy(1e6 / mired));
  return out;
})();

export const PLANCK_TICKS = [1500, 2000, 2500, 3000, 4000, 6000, 10000].map((k) => ({ k, xy: planckXy(k) }));

function insideLocus(x: number, y: number): boolean {
  const poly = SPECTRAL_LOCUS.map((p) => p.xy);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * Paint the gamut into a canvas whose pixel grid spans x ∈ [0, xMax], y ∈ [0, yMax]
 * (y up). Colours are normalised to full brightness and softened toward white.
 */
export function paintGamut(canvas: HTMLCanvasElement, xMax: number, yMax: number, soften = 0.25) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const y = ((h - 1 - py) / (h - 1)) * yMax;
    for (let px = 0; px < w; px++) {
      const x = (px / (w - 1)) * xMax;
      const o = (py * w + px) * 4;
      if (y <= 0 || !insideLocus(x, y)) continue;
      const X = x / y;
      const Z = (1 - x - y) / y;
      let r = 3.2406 * X - 1.5372 - 0.4986 * Z;
      let g = -0.9689 * X + 1.8758 + 0.0415 * Z;
      let b = 0.0557 * X - 0.204 + 1.057 * Z;
      const min = Math.min(r, g, b);
      if (min < 0) {
        r -= min;
        g -= min;
        b -= min;
      }
      const max = Math.max(r, g, b);
      r /= max;
      g /= max;
      b /= max;
      img.data[o] = Math.round(255 * (gamma(r) * (1 - soften) + soften));
      img.data[o + 1] = Math.round(255 * (gamma(g) * (1 - soften) + soften));
      img.data[o + 2] = Math.round(255 * (gamma(b) * (1 - soften) + soften));
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Pixel statistics of a loaded favicon, used to pick a tile background that contrasts with the
// icon. Needs a same-origin image (the backend proxy): a cross-origin one taints the canvas and
// getImageData throws, which degrades to null, i.e. no contrast rescue for that icon.

export interface IconTone {
  /** The icon brings its own opaque (or near-full) background and needs no tile behind it. */
  plate: boolean;
  /** Mean relative (linear-light) luminance of the visible pixels, 0..1. */
  luminance: number;
  /** Share of the sample that is opaque, 0..1. */
  coverage: number;
}

export type IconToneClass = 'light' | 'dark' | 'mid';

const SAMPLE = 24;
const cache = new Map<string, IconTone | null>();

// A canvas per analysis, never shared: a taint is permanent, so one unreadable image (a
// cross-origin one, or an SVG with foreignObject) must not poison every icon analysed after it.
function context(): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  return canvas.getContext('2d', { willReadFrequently: true });
}

/** Memoised per image URL; the image must be fully loaded. */
export function analyzeIconTone(img: HTMLImageElement): IconTone | null {
  const key = img.src;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const tone = compute(img);
  cache.set(key, tone);
  return tone;
}

function compute(img: HTMLImageElement): IconTone | null {
  try {
    const ctx = context();
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    let covered = 0;
    let lum = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] <= 32) continue;
      covered++;
      // Linear light, not gamma-encoded values: a saturated orange or green sits around 0.4
      // here and stays on the neutral tile, while white and pale glyphs score near 1.
      lum += 0.2126 * linear(data[i]) + 0.7152 * linear(data[i + 1]) + 0.0722 * linear(data[i + 2]);
    }
    const coverage = covered / (SAMPLE * SAMPLE);
    // Nothing drew (e.g. an SVG without intrinsic size in Firefox).
    if (coverage < 0.02) return null;
    return { plate: coverage >= 0.7 || cornersOpaque(data), luminance: lum / covered, coverage };
  } catch {
    return null;
  }
}

const LINEAR = new Float32Array(256).map((_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

function linear(channel: number): number {
  return LINEAR[channel];
}

function cornersOpaque(data: Uint8ClampedArray): boolean {
  const last = SAMPLE - 2;
  for (const [x0, y0] of [
    [0, 0],
    [last, 0],
    [0, last],
    [last, last],
  ]) {
    let sum = 0;
    for (let y = y0; y < y0 + 2; y++) {
      for (let x = x0; x < x0 + 2; x++) sum += data[(y * SAMPLE + x) * 4 + 3];
    }
    if (sum / 4 <= 200) return false;
  }
  return true;
}

/** Tile tone class; null when the icon is a plate or nothing could be measured. */
export function toneOf(tone: IconTone | null): IconToneClass | null {
  if (!tone || tone.plate) return null;
  // Light: white, light grey, yellow — invisible on the light theme's tile. Dark: black and
  // near-black (0.05 linear ≈ #404040) — invisible on the dark theme's tile.
  if (tone.luminance >= 0.6) return 'light';
  if (tone.luminance <= 0.05) return 'dark';
  return 'mid';
}

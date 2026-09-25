// vision.js — turn an avatar image into a small set of comparable visual
// features:
//   - a 64-bit difference-hash (dHash), for "how similar do these two pfps
//     actually look" as a single number (Hamming distance between hashes)
//   - average hue/saturation/lightness and a 2×2 quadrant brightness map,
//     for describing WHY two hashes are close, in words a human can use
//   - a dominant-color share, for recognizing "this isn't really a photo" —
//     a flat solid-color swatch or one of the generic icon-on-flat-background
//     pfps some clients offer as a no-photo default. Two of those hash as
//     near-identical "twins" for a reason that has nothing to do with the
//     people behind them, so callers use this to drop them from comparison
//     rather than report a meaningless pair.
//   No AI/model inference anywhere — every feature here is a deterministic
//   pixel average or a pixel-vs-neighbour comparison.
//
// Reading pixels back (getImageData) throws a tainted-canvas SecurityError
// on a plain cross-origin <img>, because cdn.bsky.app sends no
// Access-Control-Allow-Origin. loadAvatar() routes every fetch through this
// site's own /img proxy (src/index.ts) instead, which re-serves the same
// bytes same-origin with an open CORS header, so drawImage()+getImageData()
// works.

export function proxied(url) {
  return url ? "/img?u=" + encodeURIComponent(url) : "";
}

export function loadAvatar(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = proxied(url);
  });
}

const HASH_COLS = 9, HASH_ROWS = 8; // dHash: compare each pixel to its right neighbour across a 9x8 grid -> 8x8 = 64 bits
const COLOR_GRID = 16; // resolution for average-color / quadrant sampling

let scratch = null;
function scratchCtx(w, h) {
  if (!scratch) scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  return scratch.getContext("2d", { willReadFrequently: true });
}

function grayscaleGrid(img, cols, rows) {
  const ctx = scratchCtx(cols, rows);
  ctx.clearRect(0, 0, cols, rows);
  ctx.drawImage(img, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);
  const g = new Float64Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const o = i * 4;
    g[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  return g;
}

function dHash(img) {
  const g = grayscaleGrid(img, HASH_COLS, HASH_ROWS);
  const bits = new Uint8Array(HASH_ROWS * (HASH_COLS - 1));
  let i = 0;
  for (let r = 0; r < HASH_ROWS; r++) {
    for (let c = 0; c < HASH_COLS - 1; c++) {
      bits[i++] = g[r * HASH_COLS + c] < g[r * HASH_COLS + c + 1] ? 1 : 0;
    }
  }
  return bits; // length 64
}

export function hammingDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

// Quantizes every sampled pixel to a coarse RGB bucket (8 levels per
// channel) and returns the share held by the single most common bucket.
// A real candid photo spreads across many buckets even against a plain
// background, because hair/skin/lighting/JPEG noise all vary pixel to
// pixel; a flat-color swatch is one bucket at ~100%, and a small icon
// centered on a flat field still leaves that field as one dominant bucket
// covering most of the grid. Exported standalone (plain pixel array in,
// number out) so it's testable without a canvas.
const BUCKET_STEP = 32; // 256 / 32 = 8 levels per channel
export function dominantColorShare(data, n) {
  const counts = new Map();
  const total = n * n;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const key =
      (Math.round(data[o] / BUCKET_STEP) << 16) |
      (Math.round(data[o + 1] / BUCKET_STEP) << 8) |
      Math.round(data[o + 2] / BUCKET_STEP);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  return max / total;
}

// [TL, TR, BL, BR] average brightness of a COLOR_GRID x COLOR_GRID sample.
function colorFeatures(img) {
  const n = COLOR_GRID;
  const ctx = scratchCtx(n, n);
  ctx.clearRect(0, 0, n, n);
  ctx.drawImage(img, 0, 0, n, n);
  const { data } = ctx.getImageData(0, 0, n, n);
  const half = n / 2;
  let rSum = 0, gSum = 0, bSum = 0;
  const quadSum = [0, 0, 0, 0], quadCount = [0, 0, 0, 0];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      rSum += r; gSum += g; bSum += b;
      const bright = 0.299 * r + 0.587 * g + 0.114 * b;
      const qi = (y < half ? 0 : 2) + (x < half ? 0 : 1);
      quadSum[qi] += bright;
      quadCount[qi]++;
    }
  }
  const total = n * n;
  const hsl = rgbToHsl(rSum / total, gSum / total, bSum / total);
  const quadrants = quadSum.map((v, i) => v / quadCount[i]); // [TL, TR, BL, BR]
  const flatShare = dominantColorShare(data, n);
  return { hsl, quadrants, flatShare };
}

// Returns null for an avatar that failed to load — callers should drop it
// from comparison rather than treat a blank image as "similar to everything."
export function analyzeAvatar(img) {
  if (!img) return null;
  return { hash: dHash(img), ...colorFeatures(img) };
}

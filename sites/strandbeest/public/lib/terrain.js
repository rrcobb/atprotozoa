// Deterministic endless terrain: heightAt(x, mode, rough) depends only on world
// x, so scrolling, pausing and changing controls never produce seams or flicker.
// x is in world units (1 unit ~ 1 px at zoom 1); height is up, 0 = sea level.

export const MODES = ["dunes", "climb", "wild"];
export const PEAK = { dunes: 1, climb: 2600, wild: 4200 };
const CLIMB_PERIOD = 22000; // beach -> summit -> beach, ~7 minutes at the default speed

function hash(i) {
  i = Math.imul(i ^ (i >>> 15), 0x2c1b3c6d);
  i = Math.imul(i ^ (i >>> 12), 0x297a2d39);
  return ((i ^ (i >>> 15)) >>> 0) / 4294967296 * 2 - 1;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise(x, seed = 0) {
  const i = Math.floor(x), t = x - i;
  const a = hash(i + seed * 7919), b = hash(i + 1 + seed * 7919);
  return a + (b - a) * fade(t);
}
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// The slow regional trend, separate from local slope.
export function regional(x, mode) {
  if (mode === "climb") {
    const p = x / CLIMB_PERIOD;
    return PEAK.climb * Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * p), 1.25);
  }
  if (mode === "wild") {
    const a1 = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / 15000);
    const a2 = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / 8300 + 1);
    return PEAK.wild * smooth(x / 2500) * (0.55 * a1 + 0.45 * a2);
  }
  return 0;
}

// [wavelength, amplitude, scales-with-altitude]
const OCT = [
  [38, 1.2, 0], [95, 3.2, 0], [230, 9, 0], [600, 22, 0], [1500, 40, 0],
  [520, 35, 1], [1300, 60, 1], [3200, 90, 1],
];

export function heightAt(x, mode = "climb", rough = 0.3) {
  const E = regional(x, mode);
  const e = Math.min(1, E / PEAK[mode] || 0) * (mode === "wild" ? 1.4 : 1);
  const rm = 0.3 + 1.4 * rough;
  let h = 0;
  for (let k = 0; k < OCT.length; k++) {
    const [w, amp, alt] = OCT[k];
    h += noise(x / w, k + 1) * amp * (alt ? e : 1);
  }
  return E + h * rm;
}

// Distant ridgelines: fbm in [0,1], one seed per parallax layer.
export function ridge(u, seed) {
  return 0.5 + 0.5 * (0.6 * noise(u / 900, seed * 11 + 3) + 0.3 * noise(u / 330, seed * 11 + 4) + 0.1 * noise(u / 110, seed * 11 + 5));
}

export { hash, smooth };

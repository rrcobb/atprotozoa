// The land, the same on the CPU and the GPU. Heights are drawn in the
// terrain's vertex shader, but jets, trees and the camera need them in JS
// too, so both sides use one value noise whose hash is exact in 32-bit floats:
// the mod-289 permutation polynomial (every intermediate stays below 2^24).
//
// NOISE_GLSL holds the same functions for shaders; keep the two in step.

const mod289 = x => x - Math.floor(x / 289) * 289;
const permute = x => mod289((x * 34 + 1) * x);
const hash = (ix, iz, seed) => permute(permute(mod289(ix) + seed) + mod289(iz)) / 289;
const fade = t => t * t * (3 - 2 * t);
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = fade(x - ix), fz = fade(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x, z, oct, seed) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, z, seed + i * 7); n += a; a *= 0.5; x *= 2; z *= 2; }
  return s / n;
}

function ridged(x, z, oct, seed) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(vnoise(x, z, seed + i * 7) * 2 - 1); s += a * r * r; n += a; a *= 0.5; x *= 2; z *= 2; }
  return s / n;
}

// Continents and seas (km scale), rolling hills, and ridged mountain ranges
// where a slow mask allows them. Sea level is y = 0.
export function heightAt(x, z) {
  const c = fbm(x / 13000, z / 13000, 3, 11);
  const land = smoothstep(0.4, 0.52, c);
  const hills = fbm(x / 2600, z / 2600, 4, 23);
  const mtn = smoothstep(0.48, 0.7, fbm(x / 17000, z / 17000, 2, 37));
  const r = ridged(x / 4200, z / 4200, 4, 51);
  return (c - 0.44) * 1500 + land * (hills * 420 + mtn * r * 2600);
}

export const NOISE_GLSL = /* glsl */ `
float n_mod289(float x) { return x - floor(x / 289.0) * 289.0; }
float n_perm(float x) { return n_mod289((x * 34.0 + 1.0) * x); }
float n_hash(float ix, float iz, float seed) { return n_perm(n_perm(n_mod289(ix) + seed) + n_mod289(iz)) / 289.0; }
float n_value(vec2 p, float seed) {
  vec2 i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = n_hash(i.x, i.y, seed), b = n_hash(i.x + 1.0, i.y, seed);
  float c = n_hash(i.x, i.y + 1.0, seed), d = n_hash(i.x + 1.0, i.y + 1.0, seed);
  return a + (b - a) * f.x + (c - a) * f.y + (a - b - c + d) * f.x * f.y;
}
float n_fbm(vec2 p, int oct, float seed) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * n_value(p, seed + float(i) * 7.0); n += a; a *= 0.5; p *= 2.0;
  }
  return s / n;
}
float n_ridged(vec2 p, int oct, float seed) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    float r = 1.0 - abs(n_value(p, seed + float(i) * 7.0) * 2.0 - 1.0);
    s += a * r * r; n += a; a *= 0.5; p *= 2.0;
  }
  return s / n;
}
float heightAt(vec2 w) {
  float c = n_fbm(w / 13000.0, 3, 11.0);
  float land = smoothstep(0.4, 0.52, c);
  float hills = n_fbm(w / 2600.0, 4, 23.0);
  float mtn = smoothstep(0.48, 0.7, n_fbm(w / 17000.0, 2, 37.0));
  float r = n_ridged(w / 4200.0, 4, 51.0);
  return (c - 0.44) * 1500.0 + land * (hills * 420.0 + mtn * r * 2600.0);
}
`;

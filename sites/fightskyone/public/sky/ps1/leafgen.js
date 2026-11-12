// Shared with TechyBen/playtreeone (src/leafgen.js); keep the two in step.
// Procedural "pixel candidates": tiny leaf blades and needle sprays are
// rasterised straight into low-res tiles, so no photo texels are ever used.
//
// Tiles store palette indices, not colours (PS1 CLUT style):
//   R = tone 0..1, the position on a palette ramp (with cluster shading baked in)
//   G = 255 for twig pixels (drawn with the bark ramp), 0 for foliage
//   B = random byte per leaf (the shader compares it to the accent chance)
//   A = coverage, strictly 0 or 255 (alpha-tested, never blended)
//
// An atlas is one row of 4 cluster tiles; leaf cards pick a column.

import { Rng, fbm, hash2 } from './rng.js';

export const ATLAS_COLUMNS = 4;

const clamp01 = v => Math.min(1, Math.max(0, v));

// Half-width profile of a blade along its length t in [0,1].
const BLADES = {
  broad: t => Math.pow(Math.sin(Math.PI * t), 0.9) * (1 - 0.35 * t),
  lobed: t => Math.pow(Math.sin(Math.PI * t), 0.7) * (0.6 + 0.4 * Math.abs(Math.cos(t * Math.PI * 3.5))),
  round: t => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
};
// [length px, width px] at a 32px tile, and blades per tile at density 1.
const BLADE_SIZE = { broad: [5, 3, 80], lobed: [6.5, 4.2, 48], round: [3.4, 2.8, 120] };

// Fake light used to shade a cluster as if it were a ball of leaves
// (pixel space, so -y is up).
const LIGHT = (() => {
  const v = [-0.45, -0.7, 0.55];
  const n = Math.hypot(...v);
  return v.map(c => c / n);
})();
function ballLight(nx, ny) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return clamp01(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
}

class Tile {
  constructor(data, stride, ox, size) {
    this.data = data; this.stride = stride; this.ox = ox; this.T = size;
  }
  plot(x, y, tone, twig, rnd) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.T || y >= this.T) return;
    const i = (y * this.stride + this.ox + x) * 4;
    this.data[i] = Math.round(clamp01(tone) * 255);
    this.data[i + 1] = twig ? 255 : 0;
    this.data[i + 2] = rnd;
    this.data[i + 3] = 255;
  }
  line(x0, y0, x1, y1, t0, t1, twig, rnd) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      this.plot(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, t0 + (t1 - t0) * k, twig, rnd);
    }
  }
  // Blade from base (bx,by) pointing along `ang`.
  blade(bx, by, ang, len, wid, shape, tone, rnd, midrib) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ex = bx + ca * len, ey = by + sa * len;
    const minx = Math.floor(Math.min(bx, ex) - wid), maxx = Math.ceil(Math.max(bx, ex) + wid);
    const miny = Math.floor(Math.min(by, ey) - wid), maxy = Math.ceil(Math.max(by, ey) + wid);
    let any = false;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const dx = x + 0.5 - bx, dy = y + 0.5 - by;
        const t = (dx * ca + dy * sa) / len;
        if (t < 0 || t > 1) continue;
        const ly = -dx * sa + dy * ca;
        const hw = shape(t) * wid * 0.5 + 0.2;
        if (Math.abs(ly) > hw) continue;
        let tn = tone + (ly / hw) * 0.06;
        if (midrib && Math.abs(ly) < 0.5) tn -= 0.1;
        this.plot(x, y, tn, false, rnd);
        any = true;
      }
    }
    if (!any) this.plot(bx + ca * len * 0.5, by + sa * len * 0.5, tone, false, rnd);
  }
}

// Broadleaf cluster: twigs from the bottom, then blades scattered inside a
// noisy round envelope, thinner toward the rim, drawn back to front.
function broadTile(tile, kind, rng, density, scale) {
  const T = tile.T, k = T / 32;
  const cx = T * 0.5, cy = T * 0.5, R = T * 0.46;
  const seed = rng.int(0, 99999);
  const env = a => R * (0.7 + 0.3 * fbm(Math.cos(a) * 1.3 + 7, Math.sin(a) * 1.3 + 7, 3, seed));
  const bx = cx + rng.float(-0.1, 0.1) * T, by = T - 1;

  const twigs = rng.int(2, 4);
  for (let i = 0; i < twigs; i++) {
    const a = -Math.PI / 2 + rng.float(-0.9, 0.9);
    const len = R * rng.float(0.8, 1.3);
    tile.line(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, 0.3, 0.55, true, 0);
  }

  const [bl, bw, per] = BLADE_SIZE[kind];
  const count = Math.round((per * density) / (scale * scale));
  const leaves = [];
  for (let tries = 0; leaves.length < count && tries < count * 8; tries++) {
    const a = rng.float(0, Math.PI * 2), rr = Math.sqrt(rng.next());
    if (rng.next() < Math.pow(rr, 3) * 0.6) continue;
    const e = env(a);
    const x = cx + Math.cos(a) * rr * e, y = cy + Math.sin(a) * rr * e * 0.9;
    const nx = (x - cx) / R, ny = (y - cy) / R;
    const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * rng.float(0.4, 1);
    leaves.push({ x, y, z, nx, ny });
  }
  leaves.sort((p, q) => p.z - q.z);
  for (const l of leaves) {
    const len = bl * k * scale * rng.float(0.75, 1.3);
    const wid = bw * k * scale * rng.float(0.8, 1.2);
    const ang = Math.atan2(l.y - by, l.x - bx) + rng.float(-1.0, 1.0);
    const tone = 0.12 + 0.72 * ballLight(l.nx, l.ny) * (0.55 + 0.45 * l.z) + rng.float(-0.08, 0.08);
    tile.blade(l.x - Math.cos(ang) * len * 0.5, l.y - Math.sin(ang) * len * 0.5, ang, len, wid,
      BLADES[kind], tone, rng.int(0, 255), kind !== 'round' && len > 5);
  }
}

// Conifer cluster: several sagging sprays radiating from the centre.
// 'spray' = fir-like combs of needles, 'tuft' = larch-like rosettes.
function needleTile(tile, kind, rng, density, scale) {
  const T = tile.T, k = T / 32;
  const cx = T * 0.5, cy = T * 0.5;
  const sprays = kind === 'spray' ? rng.int(4, 6) : rng.int(3, 5);
  const a0 = rng.float(0, Math.PI * 2);
  const order = [...Array(sprays).keys()].map(i => ({ i, z: rng.next() })).sort((p, q) => p.z - q.z);
  const every = kind === 'spray' ? 1 : Math.max(2, Math.round(3 * k * scale));
  for (const { i, z } of order) {
    const a = a0 + i * (Math.PI * 2 / sprays) + rng.float(-0.35, 0.35);
    const len = T * rng.float(0.3, 0.46);
    const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len * 0.85;
    const sag = len * rng.float(0.05, 0.15);
    const steps = Math.ceil(len);
    const rnd = rng.int(0, 255);
    const shade = 0.55 + 0.45 * z;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = cx + (ex - cx) * t, y = cy + (ey - cy) * t + Math.sin(t * Math.PI) * sag;
      if (t < 0.9) tile.plot(x, y, 0.35, true, 0);
      if (s % every || rng.next() > density) continue;
      const env = Math.sin(Math.PI * (0.1 + 0.9 * t));
      const nl = ((kind === 'spray' ? 4.5 : 3) * env + 1) * k * scale;
      const n = kind === 'spray' ? 2 : 5;
      const spin = rng.float(0, Math.PI * 2);
      for (let j = 0; j < n; j++) {
        const na = kind === 'spray'
          ? a + (j ? 1 : -1) * rng.float(0.7, 1.1)
          : spin + j * (Math.PI * 2 / n) + rng.float(-0.3, 0.3);
        const L = nl * rng.float(0.7, 1.1);
        const x2 = x + Math.cos(na) * L, y2 = y + Math.sin(na) * L;
        const tone = 0.1 + 0.78 * ballLight((x2 - cx) / (T * 0.5), (y2 - cy) / (T * 0.5)) * shade;
        tile.line(x, y, x2, y2, tone - 0.08, tone + 0.06, false, rnd);
      }
    }
  }
}

export function makeLeafAtlas(kind, { tile = 32, density = 1, scale = 1, seed = 1 } = {}) {
  const W = tile * ATLAS_COLUMNS;
  const data = new Uint8Array(W * tile * 4);
  const rng = new Rng(seed);
  for (let v = 0; v < ATLAS_COLUMNS; v++) {
    const t = new Tile(data, W, v * tile, tile);
    if (kind === 'spray' || kind === 'tuft') needleTile(t, kind, rng, density, scale);
    else broadTile(t, kind, rng, density, scale);
  }
  return { data, width: W, height: tile };
}

// Tileable bark tone: vertical streaks, dark cracks, light speckles.
export function makeBarkTexture(seed = 1, w = 16, h = 32) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const streak = fbm((x / w) * 8, (y / h) * 2, 3, seed, 8, 2);
      const crack = fbm((x / w) * 4, (y / h) * 6, 2, seed + 9, 4, 6);
      let t = 0.3 + 0.55 * streak;
      if (crack > 0.62) t *= 0.55;
      if (hash2(x, y, seed + 3) < 0.07) t += 0.15;
      const i = (y * w + x) * 4;
      data[i] = Math.round(clamp01(t) * 255);
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

// Tileable ground tone: broad patches, grass clumps, speckle.
export function makeGroundTexture(seed = 1, size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 4, (y / size) * 4, 4, seed, 4, 4);
      const clump = fbm((x / size) * 16, (y / size) * 16, 2, seed + 5, 16, 16);
      let t = 0.2 + 0.6 * n + (clump - 0.5) * 0.35;
      const h = hash2(x, y, seed + 11);
      if (h < 0.12) t += 0.18;
      else if (h > 0.93) t -= 0.18;
      const i = (y * size + x) * 4;
      data[i] = Math.round(clamp01(t) * 255);
      data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

// Pure logic: a set of lumpy polyhedral dice, their landing odds, and the grid
// their summed top faces draw on. No DOM in here so it can be tested under node.
//
// A roll throws every die in the set; each shows a top face carrying an integer;
// the integers add up to s. Cell s of the grid (walked along a Hilbert curve so
// neighbouring sums are neighbouring cells) gets a tally. A sum past the last
// cell is a miss. The dice are *evolved* so the distribution of s matches the
// ink in the target picture.

import { fibNormals, buildPoly, topProbs } from "./geometry.js";

export const N = 8;            // grid is N x N
export const CELLS = N * N;     // sums 0..CELLS-1 land on the grid
export const SET = [7, 20, 7, 20, 12]; // faces per die: weird d7s next to lumpy d20s and a d12
export const MAX_VAL = 40;      // face values are integers 0..MAX_VAL; sums past CELLS-1 are misses

// Hilbert curve index -> [col,row] on an N x N grid (N a power of two)
export function hilbert(d) {
  let x = 0, y = 0, t = d;
  for (let s = 1; s < N; s *= 2) {
    const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } [x, y] = [y, x]; }
    x += s * rx; y += s * ry;
    t >>= 2;
  }
  return [x, y];
}
export const CELL_OF_SUM = Array.from({ length: CELLS }, (_, s) => { const [c, r] = hilbert(s); return r * N + c; });

// ---- a set of dice ----
// gene: { normals:[[x,y,z]], logd:[..], vals:[int..] } ; model adds poly + top-face odds
export function randomGene(n, rand = Math.random) {
  return {
    normals: fibNormals(n),
    logd: Array.from({ length: n }, () => (rand() - 0.5) * 0.5),
    vals: Array.from({ length: n }, () => Math.floor(rand() * (CELLS / SET.length))),
  };
}

// memoised per gene object: the evolver clones a die before changing it, so a
// cached model never goes stale, and untouched dice cost nothing to re-score
const cache = new WeakMap();
export function modelOf(gene) {
  if (cache.has(gene)) return cache.get(gene);
  const m = buildModel(gene);
  cache.set(gene, m);
  return m;
}

function buildModel(gene) {
  const poly = buildPoly(gene.normals, gene.logd.map(Math.exp));
  if (!poly) return null;
  const p = topProbs(poly);
  return { poly, p, vals: poly.faces.map((f) => gene.vals[f.k]) };
}

// pmf of the sum over cells 0..CELLS-1 (+ miss mass in the last slot)
export function sumPmf(models) {
  let pmf = new Float64Array(CELLS + 1);
  pmf[0] = 1;
  for (const m of models) {
    const next = new Float64Array(CELLS + 1);
    for (let s = 0; s <= CELLS; s++) {
      const ps = pmf[s];
      if (!ps) continue;
      if (s === CELLS) { next[CELLS] += ps; continue; }
      for (let i = 0; i < m.p.length; i++) {
        if (!m.p[i]) continue;
        const t = s + m.vals[i];
        next[t >= CELLS ? CELLS : t] += ps * m.p[i];
      }
    }
    pmf = next;
  }
  return pmf;
}

// target pmf over sums: the ink at each sum's cell, normalised
export function targetPmf(pic) {
  const t = new Float64Array(CELLS);
  let ink = 0;
  for (let s = 0; s < CELLS; s++) { const k = CELL_OF_SUM[s]; t[s] = pic[Math.floor(k / N)][k % N]; ink += t[s]; }
  if (ink > 0) for (let s = 0; s < CELLS; s++) t[s] /= ink;
  return t;
}

// 1 - total variation distance between two pmfs (1 = identical). Miss mass counts against.
export function overlap(pmf, target) {
  let o = 0;
  for (let s = 0; s < CELLS; s++) o += Math.min(pmf[s], target[s]);
  return o;
}

export function fitness(genes, target) {
  const models = [];
  for (const g of genes) { const m = modelOf(g); if (!m) return { fit: 0, models: null }; models.push(m); }
  return { fit: overlap(sumPmf(models), target), models };
}

// ---- rolling ----
function pick(p, u) {
  let acc = 0;
  for (let i = 0; i < p.length; i++) { acc += p[i]; if (u < acc) return i; }
  return p.length - 1;
}

// A fast roll straight from the odds: no physics, one number per die.
export function rollFast(models, rand = Math.random) {
  let s = 0;
  const faces = models.map((m) => { const i = pick(m.p, rand()); s += m.vals[i]; return i; });
  return { sum: s, faces };
}

// 1 - total variation distance between the empirical tally (per cell) and the target picture
export function match(pic, tally, rolls) {
  if (!rolls) return 0;
  let ink = 0;
  for (const row of pic) for (const v of row) ink += v;
  if (ink <= 0) return 0;
  let tv = 0;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) tv += Math.abs(tally[r * N + c] / rolls - pic[r][c] / ink);
  // misses land nowhere: their share of rolls is error too
  let hits = 0;
  for (const v of tally) hits += v;
  tv += Math.abs(1 - hits / rolls);
  return Math.max(0, 1 - tv / 2);
}

// ---- pictures: sampled from shape functions so any N works ----
const S = 4; // supersamples per axis for soft edges (antialiasing, not a limit)

function sample(fn) {
  const pic = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) {
      let hit = 0;
      for (let i = 0; i < S; i++)
        for (let j = 0; j < S; j++) {
          const x = ((c + (j + 0.5) / S) / N) * 2 - 1;
          const y = 1 - ((r + (i + 0.5) / S) / N) * 2;
          hit += fn(x, y);
        }
      row.push(hit / (S * S));
    }
    pic.push(row);
  }
  return pic;
}

export const PICTURES = {
  heart: () => sample((x, y) => {
    const X = x * 1.15, Y = y * 1.15 + 0.1;
    return Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y <= 0 ? 1 : 0;
  }),
  smiley: () => sample((x, y) => {
    const d = Math.hypot(x, y);
    if (d > 0.92) return 0;
    if (Math.hypot(x + 0.33, y - 0.3) < 0.13 || Math.hypot(x - 0.33, y - 0.3) < 0.13) return 0;
    if (d > 0.45 && d < 0.65 && y < -0.1) return 0;
    return 1;
  }),
  target: () => sample((x, y) => {
    const d = Math.hypot(x, y);
    return (d < 0.18 || (d > 0.38 && d < 0.55) || (d > 0.75 && d < 0.92)) ? 1 : 0;
  }),
  star: () => sample((x, y) => {
    const a = Math.atan2(y, x) + Math.PI / 2, d = Math.hypot(x, y);
    const k = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5);
    const t = Math.abs(k / (2 * Math.PI / 5) - 0.5) * 2; // 0 at tip, 1 at notch
    return d < 0.95 * (1 - 0.62 * t) ? 1 : 0;
  }),
  gradient: () => sample((x, y) => Math.max(0, Math.min(1, (x + y + 2) / 4))),
  d20: () => sample((x, y) => {
    // a d20 seen face-on: hexagon outline around a filled triangle
    const hex = (R) => Math.max(Math.abs(y), Math.abs(x) * 0.866 + Math.abs(y) * 0.5) <= R;
    if (hex(0.95) && !hex(0.8)) return 1;
    return y <= 0.5 && y >= -0.4 && Math.abs(x) <= (0.5 - y) * 0.577 ? 1 : 0;
  }),
};

export function blank() {
  return Array.from({ length: N }, () => Array(N).fill(0));
}

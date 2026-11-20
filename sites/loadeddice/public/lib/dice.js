// Pure logic: turn a target picture into a set of weighted dice, and roll them.
// No DOM in here so it can be tested under node.
//
// Picture = N x N array of ink levels in 0..1. The set is N+1 dice:
//   * one "row die" with N faces, face r weighted by the ink in row r
//   * one "column die" per row, face c weighted by the ink at (row, c)
// Roll the row die, then that row's column die, tally the cell. Probability of
// cell (r,c) is ink(r,c)/totalInk, so the tally converges on the picture.

export const N = 20; // icosahedron: the d20 has exactly 20 faces

export function buildDice(pic) {
  const colDice = pic.map((row) => cumulative(row));
  const rowDie = cumulative(pic.map((row) => row.reduce((a, b) => a + b, 0)));
  return { rowDie, colDice };
}

function cumulative(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let run = 0;
  const cum = weights.map((w) => (run += w));
  return { weights, cum, total };
}

// Pick a face index from a die given u in [0,1). Zero-weight faces never win.
export function rollFace(die, u) {
  if (die.total <= 0) return -1;
  const x = u * die.total;
  let lo = 0, hi = die.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (die.cum[mid] > x) hi = mid; else lo = mid + 1;
  }
  return lo;
}

export function rollSet(dice, rand = Math.random) {
  const r = rollFace(dice.rowDie, rand());
  if (r < 0) return null;
  const c = rollFace(dice.colDice[r], rand());
  return { r, c };
}

// 1 - total variation distance between the empirical tally and the target,
// as 0..1. 1 means the tally is exactly the picture.
export function match(pic, tally, rolls) {
  if (!rolls) return 0;
  let ink = 0;
  for (const row of pic) for (const v of row) ink += v;
  if (ink <= 0) return 0;
  let tv = 0;
  for (let r = 0; r < pic.length; r++)
    for (let c = 0; c < pic[r].length; c++)
      tv += Math.abs(tally[r * pic.length + c] / rolls - pic[r][c] / ink);
  return 1 - tv / 2;
}

// ---- pictures: sampled from shape functions so any N works ----
const S = 4; // supersamples per axis for soft edges (antialiasing, not a cap)

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

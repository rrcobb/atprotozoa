// Pure rules for chess trickshot. One white piece (the shooter) must clear
// the whole board in a single chain where every move is a capture, taking the
// black king LAST. Sliders are blocked by any piece in the way.
export const SIZE = 8;
export const SHOOTERS = {
  n: { name: "knight", glyph: "♞" },
  b: { name: "bishop", glyph: "♝" },
  r: { name: "rook", glyph: "♜" },
  q: { name: "queen", glyph: "♛" },
};
const DIRS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};
const JUMPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const inB = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const key = (x, y) => x + "," + y;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// targets: [{x,y,t}] still on the board (t is a piece letter, "k" = king).
// Returns the targets the shooter at (x,y) can capture right now.
export function captures(type, x, y, targets) {
  const at = new Map(targets.map((p) => [key(p.x, p.y), p]));
  const out = [];
  if (type === "n") {
    for (const [dx, dy] of JUMPS) { const p = at.get(key(x + dx, y + dy)); if (p) out.push(p); }
  } else {
    for (const [dx, dy] of DIRS[type]) {
      for (let nx = x + dx, ny = y + dy; inB(nx, ny); nx += dx, ny += dy) {
        const p = at.get(key(nx, ny));
        if (p) { out.push(p); break; }
      }
    }
  }
  // the king may only fall last: it is a legal capture only when it is the sole target left
  return targets.length > 1 ? out.filter((p) => p.t !== "k") : out;
}

// Count capture chains that clear the board (stops counting at `limit`).
export function countSolutions(puzzle, limit = 50) {
  let n = 0;
  const go = (x, y, left) => {
    if (n >= limit) return;
    if (!left.length) { n++; return; }
    for (const p of captures(puzzle.type, x, y, left)) go(p.x, p.y, left.filter((q) => q !== p));
  };
  go(puzzle.shooter.x, puzzle.shooter.y, puzzle.targets);
  return n;
}

const FILLER = ["p", "p", "p", "n", "b", "r", "q"];

// Every square the shooter could reach from (x,y) ignoring blockers (used to
// grow a chain; the solver then checks the real, blocked board).
function reach(type, x, y) {
  if (type === "n") return JUMPS.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter((p) => inB(p.x, p.y));
  const out = [];
  for (const [dx, dy] of DIRS[type]) for (let nx = x + dx, ny = y + dy; inB(nx, ny); nx += dx, ny += dy) out.push({ x: nx, y: ny });
  return out;
}

// A seeded puzzle with `count` victims (the last of which is the king). The
// victims are laid along a random chain of the shooter's own moves, so a
// solution exists by construction; boards with more than 6 solutions are
// rejected so it plays like a puzzle rather than a free-for-all.
export function makePuzzle(type, count, seed = 1) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const r = rng(seed * 7919 + attempt);
    const used = new Set();
    const x = Math.floor(r() * SIZE), y = Math.floor(r() * SIZE);
    const shooter = { x, y };
    used.add(key(x, y));
    const targets = [];
    let cur = shooter;
    for (let i = 0; i < count; i++) {
      const opts = reach(type, cur.x, cur.y).filter((p) => !used.has(key(p.x, p.y)));
      if (!opts.length) break;
      const p = opts[Math.floor(r() * opts.length)];
      used.add(key(p.x, p.y));
      targets.push({ ...p, t: i === count - 1 ? "k" : FILLER[Math.floor(r() * FILLER.length)] });
      cur = p;
    }
    if (targets.length < count) continue;
    const puzzle = { type, shooter, targets };
    const n = countSolutions(puzzle, 7);
    if (n >= 1 && n <= 6) return puzzle;
  }
  throw new Error("no puzzle found");
}

export const LEVELS = [
  { name: "warm-up", type: "q", count: 4 },
  { name: "ricochet", type: "b", count: 4 },
  { name: "rook roulette", type: "r", count: 5 },
  { name: "horse trick", type: "n", count: 5 },
  { name: "the long way round", type: "b", count: 6 },
  { name: "full send", type: "n", count: 7 },
];

export function newShot(level, seed = level + 1) {
  const L = LEVELS[level];
  return { level, puzzle: makePuzzle(L.type, L.count, seed), pos: null, left: null, trail: [], status: "playing", style: 0, log: [] };
}
export function startShot(s) {
  s.pos = { ...s.puzzle.shooter };
  s.left = s.puzzle.targets.slice();
  s.trail = [{ ...s.pos }];
  s.status = "playing"; s.style = 0; s.log = [];
  return s;
}
export function legal(s) { return s.status === "playing" ? captures(s.puzzle.type, s.pos.x, s.pos.y, s.left) : []; }

const CALLS = ["NOSCOPE!", "wow.", "clean.", "unreal.", "ricochet!", "sheesh.", "the crowd goes quiet.", "SLAPSHOT!", "no way.", "that's illegal in 4 countries."];
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
// Style = squares travelled per shot, with later links in the chain paying more.
export function styleOf(trail) {
  let n = 0;
  for (let i = 1; i < trail.length; i++) n += dist(trail[i - 1], trail[i]) * 10 + i * 5;
  return n;
}
function sync(s) {
  const taken = new Set(s.trail.slice(1).map((c) => key(c.x, c.y)));
  s.left = s.puzzle.targets.filter((t) => !taken.has(key(t.x, t.y)));
  s.pos = { ...s.trail[s.trail.length - 1] };
  s.style = styleOf(s.trail);
  s.status = !s.left.length ? "won" : captures(s.puzzle.type, s.pos.x, s.pos.y, s.left).length ? "playing" : "stuck";
}
// Take a capture at (x,y).
export function shoot(s, x, y) {
  const p = legal(s).find((q) => q.x === x && q.y === y);
  if (!p) return false;
  const d = dist(p, s.pos);
  s.trail.push({ x: p.x, y: p.y });
  sync(s);
  s.log.push(p.t === "k" ? "KING DOWN." + (d >= 5 ? " from across the board." : "") : CALLS[(s.trail.length + d) % CALLS.length]);
  if (s.status === "stuck") s.log.push("out of shots. undo or reset and re-aim.");
  return true;
}
export function undo(s) {
  if (s.trail.length < 2) return false;
  s.trail.pop();
  s.log = s.log.filter((l) => !l.startsWith("out of shots")).slice(0, s.trail.length - 1);
  sync(s);
  return true;
}
export function rank(s) {
  if (s.status !== "won") return "—";
  return s.style >= 400 ? "S  trickshot god" : s.style >= 250 ? "A  montage material" : s.style >= 150 ? "B  lobby legend" : "C  lucky";
}

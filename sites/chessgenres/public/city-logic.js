// Pure rules for Chess City 2000 — no DOM, so tests can import it.
// 12x12 board, cells[r*N+c] is null or {type, pop}. Buildings influence the
// squares they could move to on an empty board (sliders aren't blocked).
export const N = 12;
export const GOAL = 2000;      // population needed to win
export const BANKRUPT = -300;  // money floor before the city folds
export const RAMPAGE_EVERY = 18; // months between giant-queen rampages

export const BUILD = {
  pawn:   { glyph: "♙", label: "house",       cost: 40,  upkeep: 0 },
  knight: { glyph: "♘", label: "shop",        cost: 80,  upkeep: 2 },
  bishop: { glyph: "♗", label: "park",        cost: 100, upkeep: 3 },
  rook:   { glyph: "♖", label: "factory",     cost: 120, upkeep: 0 },
  queen:  { glyph: "♕", label: "power plant", cost: 300, upkeep: 12 },
};

const KN = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];

export function reach(type, r, c) {
  const out = [];
  const inb = (a, b) => a >= 0 && b >= 0 && a < N && b < N;
  const slide = (dirs) => { for (const [dr, dc] of dirs) for (let k = 1; inb(r + dr*k, c + dc*k); k++) out.push([r + dr*k, c + dc*k]); };
  if (type === "knight") { for (const [dr, dc] of KN) if (inb(r + dr, c + dc)) out.push([r + dr, c + dc]); }
  else if (type === "bishop") slide(DIAG);
  else if (type === "rook") slide(ORTH);
  else if (type === "queen") slide(DIAG.concat(ORTH));
  return out;
}

export function newCity() {
  return { money: 800, month: 0, cells: Array(N * N).fill(null), status: "playing" };
}

export const totalPop = (city) => city.cells.reduce((s, x) => s + (x ? x.pop || 0 : 0), 0);

// Per-square influence: how many powered / parks / shops / factories reach it.
export function analyze(city) {
  const inf = Array.from({ length: N * N }, () => ({ power: 0, parks: 0, shops: 0, factories: 0 }));
  city.cells.forEach((b, i) => {
    if (!b || b.type === "pawn") return;
    const key = { queen: "power", bishop: "parks", knight: "shops", rook: "factories" }[b.type];
    for (const [r, c] of reach(b.type, Math.floor(i / N), i % N)) inf[r * N + c][key]++;
  });
  return inf;
}

// Happiness multiplier and population ceiling for a house given its influence.
export function houseScore(i) {
  const s = 1 + 0.4 * Math.min(i.parks, 2) + 0.25 * Math.min(i.shops, 2) - 0.5 * Math.min(i.factories, 2);
  return Math.min(2.2, Math.max(0.2, s));
}
export const houseCap = (i) => (i.power ? Math.round(24 * houseScore(i)) : 0);

export function place(city, type, idx) {
  const def = BUILD[type];
  if (!def || city.cells[idx] || city.money < def.cost) return false;
  city.money -= def.cost;
  city.cells[idx] = { type, pop: 0 };
  return true;
}

export function bulldoze(city, idx) {
  if (!city.cells[idx]) return false;
  city.cells[idx] = null;
  return true;
}

// Advance one month. rng() -> [0,1). Returns a list of event strings.
export function tick(city, rng = Math.random) {
  const events = [];
  if (city.status !== "playing") return events;
  city.month++;
  const inf = analyze(city);
  let income = 0;
  city.cells.forEach((b, i) => {
    if (!b) return;
    income -= BUILD[b.type].upkeep;
    if (b.type === "pawn") {
      const cap = houseCap(inf[i]);
      b.pop = b.pop < cap ? Math.min(cap, b.pop + 3) : Math.max(cap, b.pop - 4);
      income += 0.12 * b.pop;
    } else if (b.type === "knight" || b.type === "rook") {
      const homes = reach(b.type, Math.floor(i / N), i % N)
        .filter(([r, c]) => city.cells[r * N + c] && city.cells[r * N + c].type === "pawn" && city.cells[r * N + c].pop > 0).length;
      income += b.type === "knight" ? 5 * homes : 30 + 3 * homes; // shops sell to homes, factories employ them
    }
  });
  city.money += Math.round(income);
  if (city.month % RAMPAGE_EVERY === 0) {
    const row = rng() < 0.5, k = Math.floor(rng() * N);
    let lost = 0;
    for (let j = 0; j < N; j++) {
      const idx = row ? k * N + j : j * N + k;
      if (city.cells[idx] && rng() < 0.5) { city.cells[idx] = null; lost++; }
    }
    events.push(`a giant queen rampaged down ${row ? "rank " + (N - k) : "file " + String.fromCharCode(97 + k)} and flattened ${lost} building${lost === 1 ? "" : "s"}.`);
  }
  if (totalPop(city) >= GOAL) city.status = "won";
  else if (city.money < BANKRUPT) city.status = "lost";
  return events;
}

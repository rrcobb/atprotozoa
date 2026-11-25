// Pure game rules for chess tower defense — no DOM, so tests can import it.
// Board is 8x8, [row, col] with row 0 at the top. Enemies walk PATH in order.
export const N = 8;

export const PATH = (() => {
  const p = [];
  for (let r = 0; r < N; r += 2) {
    const cols = (r / 2) % 2 === 0 ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
    for (const c of cols) p.push([r, c]);
    if (r + 2 < N) p.push([r + 1, cols[cols.length - 1]]); // connector down
  }
  return p;
})();

export const PIECES = {
  pawn:   { glyph: "♙", cost: 50,  dmg: 6,  cd: 0.5,  label: "pawn" },
  knight: { glyph: "♘", cost: 100, dmg: 14, cd: 0.8,  label: "knight" },
  bishop: { glyph: "♗", cost: 120, dmg: 12, cd: 0.6,  label: "bishop" },
  rook:   { glyph: "♖", cost: 160, dmg: 20, cd: 0.7,  label: "rook" },
  queen:  { glyph: "♕", cost: 350, dmg: 26, cd: 0.4,  label: "queen" },
};

const KN = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];

// Squares a piece "could move to" on an empty board (sliders are not blocked
// by other towers — towers are guards, not obstacles).
export function attackSquares(type, r, c) {
  const out = [];
  const inb = (a, b) => a >= 0 && b >= 0 && a < N && b < N;
  const slide = (dirs) => { for (const [dr, dc] of dirs) for (let k = 1; inb(r + dr*k, c + dc*k); k++) out.push([r + dr*k, c + dc*k]); };
  const step = (offs) => { for (const [dr, dc] of offs) if (inb(r + dr, c + dc)) out.push([r + dr, c + dc]); };
  if (type === "pawn") step(DIAG.concat(ORTH)); // pawns guard their immediate neighbours
  else if (type === "knight") step(KN);
  else if (type === "bishop") slide(DIAG);
  else if (type === "rook") slide(ORTH);
  else if (type === "queen") slide(DIAG.concat(ORTH));
  return out;
}

// Position along the path (float index) -> board coordinates (float).
export function pathPos(t, path = PATH) {
  const i = Math.min(Math.max(t, 0), path.length - 1);
  const a = Math.floor(i), b = Math.min(a + 1, path.length - 1), f = i - a;
  return [path[a][0] + (path[b][0] - path[a][0]) * f, path[a][1] + (path[b][1] - path[a][1]) * f];
}

export const WAVES = 10; // the first boss; endless mode continues past it with a bigger boss every WAVES waves

// A wave is a list of {at (seconds from wave start), kind}.
// armor is subtracted from every hit (a hit never does less than a quarter of its damage).
export const KINDS = {
  pawn:   { hp: 40,  speed: 1.2, reward: 6,  glyph: "♟", size: 0.5,  leak: 1, armor: 0 },
  knight: { hp: 90,  speed: 1.9, reward: 10, glyph: "♞", size: 0.55, leak: 1, armor: 0 },
  bishop: { hp: 150, speed: 1.5, reward: 14, glyph: "♝", size: 0.58, leak: 2, armor: 2 },
  rook:   { hp: 320, speed: 0.9, reward: 24, glyph: "♜", size: 0.62, leak: 3, armor: 5 },
  king:   { hp: 1400, speed: 0.7, reward: 90, glyph: "♚", size: 0.95, leak: 5, armor: 6 }, // elite, every 5th wave
  boss:   { hp: 9000, speed: 0.45, reward: 0, glyph: "♛", size: 1.3, leak: 99, armor: 8 },
};

export const DIFFS = {
  easy:   { label: "easy",   gold: 320, lives: 15, hp: 0.85 },
  normal: { label: "normal", gold: 250, lives: 10, hp: 1 },
  hard:   { label: "hard",   gold: 200, lives: 6,  hp: 1.25 },
};

// Small seeded PRNG so a seed number always gives the same map and waves.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural road: a self-avoiding orthogonal walk between two edge squares that
// never touches itself, found by randomized depth-first search. Falls back to the
// classic serpentine if the search runs dry (it very rarely does).
export function makePath(seed) {
  const rng = mulberry32(seed);
  const edge = (r, c) => r === 0 || c === 0 || r === N - 1 || c === N - 1;
  for (let attempt = 0; attempt < 60; attempt++) {
    const target = 20 + Math.floor(rng() * 9);
    const edges = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (edge(r, c)) edges.push([r, c]);
    const [sr, sc] = edges[Math.floor(rng() * edges.length)];
    const p = [], seen = new Set();
    let budget = 3000; // search steps per attempt, so a bad start can't hang the page
    const dfs = (r, c) => {
      if (budget-- <= 0) return false;
      p.push([r, c]); seen.add(r * N + c);
      if (p.length >= target && edge(r, c)) return true;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(() => rng() - 0.5);
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= N || nc >= N || seen.has(nr * N + nc)) continue;
        // keep the road from brushing against itself so there's room to build between the bends
        let touch = 0;
        for (const [er, ec] of [[1,0],[-1,0],[0,1],[0,-1]]) if (seen.has((nr + er) * N + nc + ec)) touch++;
        if (touch > 1) continue;
        if (dfs(nr, nc)) return true;
      }
      p.pop(); seen.delete(r * N + c);
      return false;
    };
    if (dfs(sr, sc)) return p;
  }
  return PATH;
}

export const isBossWave = (w) => w > 0 && w % WAVES === 0;

export const THEMES = {
  mixed:   { label: "mixed column" },
  swarm:   { label: "pawn swarm" },
  rush:    { label: "knight rush" },
  armored: { label: "armored push" },
};
// Which kind of wave is coming, fixed by seed so it can be previewed. Early waves are always mixed.
export function waveTheme(seed, w) {
  if (w < 3 || isBossWave(w)) return "mixed";
  const keys = Object.keys(THEMES);
  return keys[Math.floor(mulberry32(seed * 31 + w * 977)() * keys.length)];
}

export function waveSpawns(w, theme = "mixed") {
  const s = [];
  const add = (n, kind, gap, start = 0) => { for (let i = 0; i < n; i++) s.push({ at: start + i * gap, kind }); };
  if (isBossWave(w)) {
    add(1, "boss", 1);
    add(14 + w, "pawn", 1.4, 4);
    add(6 + Math.floor(w / 2), "knight", 2.5, 8);
    return s.sort((a, b) => a.at - b.at);
  }
  if (theme === "swarm") {
    add(14 + w * 3, "pawn", Math.max(0.3, 0.7 - w * 0.02));
    add(Math.floor(w / 2), "bishop", 2, 6);
  } else if (theme === "rush") {
    add(w * 3, "knight", Math.max(0.5, 1.0 - w * 0.03));
    add(4 + w, "pawn", 1, 2);
  } else if (theme === "armored") {
    add(Math.max(2, Math.floor(w * 0.8)), "rook", 2.2);
    add(w, "bishop", 1.6, 3);
  } else {
    add(6 + w * 2, "pawn", Math.max(0.5, 1.1 - w * 0.05));
    if (w >= 2) add(w * 2, "knight", 1.2, 3);
    if (w >= 4) add(w - 2, "bishop", 1.6, 6);
    if (w >= 6) add(w - 4, "rook", 2.4, 8);
  }
  if (w % 5 === 0) add(Math.ceil(w / 5), "king", 4, 10); // elite
  return s.sort((a, b) => a.at - b.at);
}

// One-line preview of a wave for the player.
export function describeWave(w, theme) {
  const n = {};
  for (const s of waveSpawns(w, theme)) n[s.kind] = (n[s.kind] || 0) + 1;
  const name = isBossWave(w) ? "BOSS wave" : THEMES[theme].label;
  return `${name}: ` + Object.entries(n).map(([k, v]) => `${v}${KINDS[k].glyph}`).join(" ");
}

// Enemy hp grows a little each wave so early towers stop being enough.
export const hpScale = (w, diff = 1) => (1 + (w - 1) * 0.18) * diff;

// Armor soaks flat damage, but chip damage always gets through. `pierce` (rooks) ignores armor.
export const hitDamage = (dmg, armor, pierce = false) => (pierce ? dmg : Math.max(dmg * 0.25, dmg - armor));

// --- towers -----------------------------------------------------------
// Each tower has up = {power, haste} upgrade counts; MAX_UP total upgrades per tower.
export const MAX_UP = 4; // beyond this a queen is unbeatable on the early waves, so spend gold on more pieces instead
export const SPECIAL = {
  pawn:   "cheap and quick",
  knight: "splash: hits the neighbours of its target at half damage",
  bishop: "slows its target",
  rook:   "armor piercing",
  queen:  "strikes two enemies at once",
};
export const TARGET_MODES = ["first", "strong", "weak"];
export const upgradeCost = (type, t) => Math.round(PIECES[type].cost * 0.6 * (1 + t.up.power + t.up.haste));
export const upgrades = (t) => t.up.power + t.up.haste;

// Chess protection: a tower another tower could "move to" is defended. Each defender adds
// 20% damage, up to two defenders (a third adds nothing, so clumping stays a trade-off).
export function defenders(towers, t) {
  return Math.min(2, towers.filter((o) => o !== t && o.cells.some(([r, c]) => r === t.r && c === t.c)).length);
}
export function towerDmg(t, relics = []) {
  const base = PIECES[t.type].dmg * (1 + 0.4 * t.up.power) * (1 + 0.2 * (t.def || 0));
  return base * (relics.includes("dmg") ? 1.15 : 1);
}
export const towerCd = (t) => PIECES[t.type].cd * Math.pow(0.78, t.up.haste);

export function pickTarget(list, mode) {
  if (!list.length) return null;
  if (mode === "strong") return list.reduce((a, b) => (b.hp > a.hp ? b : a));
  if (mode === "weak") return list.reduce((a, b) => (b.hp < a.hp ? b : a));
  return list.reduce((a, b) => (b.t > a.t ? b : a));
}

// --- relics: a pick-one-of-three boon after every second wave ----------
export const RELICS = {
  dmg:   { label: "war drums",   desc: "all towers +15% damage" },
  bank:  { label: "tax office",  desc: "+30% gold for clearing a wave" },
  heart: { label: "royal guard", desc: "+2 lives now" },
  levy:  { label: "bounty",      desc: "enemies drop 30% more gold" },
  cheap: { label: "guild rates", desc: "new pieces cost 15% less" },
  check: { label: "long check",  desc: "freeze charges recharge twice as fast" },
  loot:  { label: "war chest",   desc: "+150 gold now" },
};
export function offerRelics(rng, owned = []) {
  const pool = Object.keys(RELICS).filter((k) => !owned.includes(k) || k === "loot" || k === "heart");
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
export const pieceCost = (type, relics = []) => Math.round(PIECES[type].cost * (relics.includes("cheap") ? 0.85 : 1));

export const tdScore = (st) => st.wave * 100 + st.lives * 25 + Math.floor(st.gold / 10) + (st.won ? 500 : 0);

export function isPathSquare(r, c, path = PATH) { return path.some(([a, b]) => a === r && b === c); }

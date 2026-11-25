// Pure rules for Chess Autobattler — no DOM, so tests can import it.
// 8x8 board. Player (side 0) holds the bottom ranks and moves up (row -1);
// the enemy (side 1) starts at the top and moves down. Each tick every living
// unit acts once: attack an enemy it could capture, otherwise step closer.
export const N = 8;
export const ROUNDS = 10;
export const MAX_TICKS = 160; // battle backstop: pieces that can't reach each other get judged on remaining hp

export const UNITS = {
  p: { glyph: ["♙", "♟"], label: "pawn",   cost: 1, hp: 30, atk: 8 },
  n: { glyph: ["♘", "♞"], label: "knight", cost: 3, hp: 45, atk: 12 },
  b: { glyph: ["♗", "♝"], label: "bishop", cost: 3, hp: 40, atk: 12 },
  r: { glyph: ["♖", "♜"], label: "rook",   cost: 4, hp: 60, atk: 14 },
  q: { glyph: ["♕", "♛"], label: "queen",  cost: 7, hp: 70, atk: 18 },
};
export const STAR = 1.8; // stat multiplier per star level

export const statsFor = (type, star) => {
  const m = Math.pow(STAR, star - 1), u = UNITS[type];
  return { hp: Math.round(u.hp * m), atk: Math.round(u.atk * m) };
};
export const makeUnit = (type, star, side, r, c) => {
  const s = statsFor(type, star);
  return { type, star, side, r, c, hp: s.hp, maxhp: s.hp, atk: s.atk };
};

const KN = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];
const inb = (r, c) => r >= 0 && c >= 0 && r < N && c < N;

// Real chess movement with blocking. Returns {moves:[[r,c]], hits:[unit]}.
export function options(u, units) {
  const at = (r, c) => units.find((x) => x.hp > 0 && x.r === r && x.c === c);
  const moves = [], hits = [];
  const probe = (r, c, canMove, canHit) => {
    if (!inb(r, c)) return false;
    const o = at(r, c);
    if (!o) { if (canMove) moves.push([r, c]); return true; }
    if (canHit && o.side !== u.side) hits.push(o);
    return false;
  };
  if (u.type === "p") {
    const d = u.side === 0 ? -1 : 1;
    probe(u.r + d, u.c, true, false);
    for (const dc of [-1, 1]) { const r = u.r + d, c = u.c + dc; if (inb(r, c)) { const o = at(r, c); if (o && o.side !== u.side) hits.push(o); } }
  } else if (u.type === "n") {
    for (const [dr, dc] of KN) probe(u.r + dr, u.c + dc, true, true);
  } else {
    const dirs = u.type === "b" ? DIAG : u.type === "r" ? ORTH : DIAG.concat(ORTH);
    for (const [dr, dc] of dirs) for (let k = 1; probe(u.r + dr * k, u.c + dc * k, true, true); k++);
  }
  return { moves, hits };
}

const dist = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));

// One unit acts. Returns an event for the UI, or null.
export function act(u, units) {
  if (u.hp <= 0) return null;
  const { moves, hits } = options(u, units);
  if (hits.length) {
    const t = hits.reduce((a, b) => (b.hp < a.hp ? b : a));
    t.hp -= u.atk;
    return { kind: "hit", from: [u.r, u.c], to: [t.r, t.c], dmg: u.atk, killed: t.hp <= 0 };
  }
  const foes = units.filter((x) => x.hp > 0 && x.side !== u.side);
  if (!foes.length || !moves.length) return null;
  const near = (p) => Math.min(...foes.map((f) => dist(p, f)));
  let best = moves[0], bd = near({ r: moves[0][0], c: moves[0][1] });
  for (const m of moves) { const d = near({ r: m[0], c: m[1] }); if (d < bd) { bd = d; best = m; } }
  if (bd >= near(u) && u.type !== "p") return null; // don't shuffle away from the fight
  u.r = best[0]; u.c = best[1];
  // A pawn that reaches the far rank promotes to a queen, keeping its health fraction.
  if (u.type === "p" && u.r === (u.side === 0 ? 0 : N - 1)) {
    const frac = u.hp / u.maxhp, s = statsFor("q", u.star);
    u.type = "q"; u.maxhp = s.hp; u.hp = Math.max(1, Math.round(s.hp * frac)); u.atk = s.atk;
    return { kind: "promote", at: [u.r, u.c] };
  }
  return { kind: "move" };
}

export const alive = (units, side) => units.filter((u) => u.hp > 0 && u.side === side);

// Run one tick: everyone alive at the start acts once, in board order.
export function tick(units) {
  const events = [];
  const order = units.filter((u) => u.hp > 0).sort((a, b) => a.r * N + a.c - (b.r * N + b.c));
  for (const u of order) { const e = act(u, units); if (e) events.push(e); }
  return events;
}

export const STALL_TICKS = 8; // a whole 8 ticks with nobody able to move or capture is a dead position, like chess

// "player" | "enemy" | "draw" | null while still going. `stalled` = consecutive ticks with no events.
export function result(units, ticks, stalled = 0) {
  const p = alive(units, 0), e = alive(units, 1);
  if (!p.length && !e.length) return "draw"; // mutual wipe-out
  if (!e.length) return "player";
  if (!p.length) return "enemy";
  const ph = p.reduce((s, u) => s + u.hp, 0), eh = e.reduce((s, u) => s + u.hp, 0);
  if (stalled >= STALL_TICKS) return "draw"; // stalemate: neither side can make progress
  if (ticks >= MAX_TICKS) return ph === eh ? "draw" : ph > eh ? "player" : "enemy";
  return null;
}

// Would the enemy accept a draw offer right now? Like an engine: only if it isn't clearly ahead.
export function acceptsDraw(units) {
  const hp = (s) => alive(units, s).reduce((t, u) => t + u.hp, 0);
  return hp(1) <= hp(0) * 1.15;
}

// Merge any three identical (type, star) pieces from a list of {type, star, ...}
// into one a star higher (max 3). Returns true if something merged.
export function mergeOnce(pieces) {
  const groups = {};
  pieces.forEach((p, i) => { if (p.star < 3) (groups[p.type + p.star] ||= []).push(i); });
  for (const idxs of Object.values(groups)) {
    if (idxs.length >= 3) {
      const keep = idxs[0], gone = idxs.slice(1, 3);
      pieces[keep].star++;
      for (const i of gone.sort((a, b) => b - a)) pieces.splice(i, 1);
      return true;
    }
  }
  return false;
}

export const maxBoard = (round, bonus = 0) => Math.min(8, 2 + round) + bonus;
export const income = (round, won) => 5 + Math.min(round, 5) + (won ? 1 : 0);
// Banking gold earns interest (1 per 5 held), and win streaks add a bonus. Both are capped at 3 so
// hoarding and snowballing can't outrun the fights themselves.
export const interest = (gold) => Math.min(3, Math.floor(gold / 5));
export const streakBonus = (streak) => Math.min(3, Math.max(0, streak - 1));

export const isBossRound = (round) => round > 0 && round % ROUNDS === 0;

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

// --- synergies: fielding several of one piece type powers them up -------
// tiers: [count needed, hp multiplier, atk multiplier]; the highest tier reached applies.
export const SYNERGIES = {
  p: { label: "phalanx",   tiers: [[3, 1.3, 1], [5, 1.6, 1.15]] },
  n: { label: "cavalry",   tiers: [[2, 1, 1.25], [3, 1, 1.5]] },
  b: { label: "twin bishops", tiers: [[2, 1.1, 1.25], [3, 1.2, 1.5]] },
  r: { label: "bulwark",   tiers: [[2, 1.3, 1], [3, 1.6, 1.1]] },
  q: { label: "royal court", tiers: [[2, 1.4, 1.4]] },
};
export const FULL_SET = { label: "full set", hp: 1.2, atk: 1.2 }; // one each of knight, bishop, rook and queen

export function activeSynergies(units) {
  const n = {};
  for (const u of units) n[u.type] = (n[u.type] || 0) + 1;
  const out = [];
  for (const [t, def] of Object.entries(SYNERGIES)) {
    let hit = null;
    for (const tier of def.tiers) if ((n[t] || 0) >= tier[0]) hit = tier;
    if (hit) out.push({ type: t, label: def.label, count: n[t], hp: hit[1], atk: hit[2] });
  }
  if (["n", "b", "r", "q"].every((t) => n[t])) out.push({ type: "*", label: FULL_SET.label, count: 4, hp: FULL_SET.hp, atk: FULL_SET.atk });
  return out;
}
// Boost fresh player units for a battle. relics can add global hp / atk too.
export function applySynergies(units, relics = []) {
  const syn = activeSynergies(units);
  for (const u of units) {
    let hp = relics.includes("plate") ? 1.15 : 1, atk = relics.includes("blade") ? 1.15 : 1;
    for (const s of syn) if (s.type === u.type || s.type === "*") { hp *= s.hp; atk *= s.atk; }
    u.maxhp = Math.round(u.maxhp * hp); u.hp = u.maxhp; u.atk = Math.round(u.atk * atk);
  }
  return syn;
}

// --- augments: pick one of three after every second round ---------------
export const RELICS = {
  slot:  { label: "extra rank",   desc: "+1 piece on the board" },
  bank:  { label: "treasury",     desc: "+4 gold now, +1 gold every round" },
  plate: { label: "plate armor",  desc: "all pieces +15% hp" },
  blade: { label: "whetstone",    desc: "all pieces +15% attack" },
  roll:  { label: "scout network", desc: "the first reroll each round is free" },
  heal:  { label: "field medic",  desc: "+3 hp now" },
};
export function offerRelics(rng, owned = []) {
  const pool = Object.keys(RELICS).filter((k) => !owned.includes(k) || k === "heal");
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export const autoScore = (g) => (g.round - 1) * 100 + g.hp * 20 + g.gold + (g.won ? 500 : 0);

// --- enemy armies: a seeded opponent style for each round ---------------
export const ARCHETYPES = {
  mixed:   { label: "mixed army",     types: null },
  storm:   { label: "pawn storm",     types: ["p"], hp: 1.1 },
  cavalry: { label: "cavalry charge", types: ["n", "p"], atk: 1.15 },
  clergy:  { label: "bishop pair",    types: ["b", "p"] },
  wall:    { label: "rook wall",      types: ["r", "p"], hp: 1.2 },
  court:   { label: "royal court",    types: ["q", "p"] },
};
function pickArchetype(round, rng) {
  const keys = round < 3 ? ["mixed", "storm"] : round < 5 ? ["mixed", "storm", "cavalry", "clergy", "wall"] : Object.keys(ARCHETYPES);
  return keys[Math.floor(rng() * keys.length)];
}

// Enemy plan for a round: {label, units}. Same rng seed -> same plan, so it can be scouted before the fight.
// Spends a budget on pieces in the top ranks. Every ROUNDS rounds a giant queen arrives, bigger each time.
export function enemyPlan(round, rng = Math.random) {
  const key = pickArchetype(round, rng), arch = ARCHETYPES[key];
  const out = [], used = new Set();
  const spot = () => { for (;;) { const r = Math.floor(rng() * 3), c = Math.floor(rng() * N); if (!used.has(r * N + c)) { used.add(r * N + c); return [r, c]; } } };
  const boss = isBossRound(round);
  if (boss) {
    const [r, c] = [0, 3];
    used.add(r * N + c);
    const q = makeUnit("q", 3, 1, r, c);
    q.hp = q.maxhp = q.maxhp * 2 * (round / ROUNDS); // the giant queen
    q.giant = true;
    out.push(q);
  }
  let budget = 3 + round * 2;
  const types = Object.keys(UNITS);
  // The board only has 24 enemy squares (3 ranks x 8 files); 20 keeps spot() from ever running out of room.
  while (budget > 0 && out.length < 20) {
    const t = arch.types && rng() < 0.8 ? arch.types[Math.floor(rng() * arch.types.length)] : types[Math.floor(rng() * types.length)];
    if (UNITS[t].cost > budget) { if (budget < 3 && t !== "p") { const [r, c] = spot(); out.push(makeUnit("p", 1, 1, r, c)); budget -= 1; } continue; }
    const star = round >= 7 && rng() < 0.3 ? 2 : 1;
    const [r, c] = spot();
    out.push(makeUnit(t, star, 1, r, c));
    budget -= UNITS[t].cost * (star === 2 ? 3 : 1);
  }
  for (const u of out) if (!u.giant) { u.maxhp = u.hp = Math.round(u.maxhp * (arch.hp || 1)); u.atk = Math.round(u.atk * (arch.atk || 1)); }
  return { label: boss ? `${arch.label} + giant queen` : arch.label, units: out };
}
export const enemyTeam = (round, rng = Math.random) => enemyPlan(round, rng).units;

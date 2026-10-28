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

// "player" | "enemy" | null while still going.
export function result(units, ticks) {
  const p = alive(units, 0), e = alive(units, 1);
  if (!p.length && !e.length) return "enemy";
  if (!e.length) return "player";
  if (!p.length) return "enemy";
  if (ticks >= MAX_TICKS) return p.reduce((s, u) => s + u.hp, 0) > e.reduce((s, u) => s + u.hp, 0) ? "player" : "enemy";
  return null;
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

export const maxBoard = (round) => Math.min(8, 2 + round);
export const income = (round, won) => 5 + Math.min(round, 5) + (won ? 1 : 0);

// Enemy team for a round: spend a budget on random pieces in the top ranks.
// The final round brings a giant queen.
export function enemyTeam(round, rng = Math.random) {
  const out = [], used = new Set();
  const spot = () => { for (;;) { const r = Math.floor(rng() * 3), c = Math.floor(rng() * N); if (!used.has(r * N + c)) { used.add(r * N + c); return [r, c]; } } };
  if (round >= ROUNDS) {
    const [r, c] = [0, 3];
    used.add(r * N + c);
    const q = makeUnit("q", 3, 1, r, c);
    q.hp = q.maxhp = q.maxhp * 2; // the giant queen
    q.giant = true;
    out.push(q);
  }
  let budget = 3 + round * 2;
  const types = Object.keys(UNITS);
  while (budget > 0 && out.length < 12) {
    const t = types[Math.floor(rng() * types.length)];
    if (UNITS[t].cost > budget) { if (budget < 3 && t !== "p") { const [r, c] = spot(); out.push(makeUnit("p", 1, 1, r, c)); budget -= 1; } continue; }
    const star = round >= 7 && rng() < 0.3 ? 2 : 1;
    const [r, c] = spot();
    out.push(makeUnit(t, star, 1, r, c));
    budget -= UNITS[t].cost * (star === 2 ? 3 : 1);
  }
  return out;
}

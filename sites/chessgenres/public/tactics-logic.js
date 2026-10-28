// Pure rules for Chess Tactics — no DOM, so tests can import it.
// A Final Fantasy Tactics-style grid battle. Units move with their real chess
// moves and strike any enemy on a square they could attack; one move (before
// attacking) and one attack per unit per turn. Everything is deterministic.
export const SIZE = 8;
export const GLYPH = {
  p: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  e: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8 = [...ORTH, ...DIAG];
const DIRS = { r: ORTH, b: DIAG, q: ALL8 };

export const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function mk(s, side, t, x, y, o) {
  const u = { id: s.nextId++, side, t, x, y, hp: o.hp, maxHp: o.hp, atk: o.atk, mv: o.mv ?? 3, rng: o.rng ?? 3, name: o.name, fixed: !!o.fixed, part: o.part || null, moved: false, acted: false };
  s.units.push(u);
  return u;
}

export const PARTY = [
  { t: "k", name: "king", hp: 16, atk: 3, mv: 1, rng: 1, x: 3, y: 7 },
  { t: "n", name: "knight", hp: 14, atk: 5, x: 4, y: 7 },
  { t: "b", name: "bishop", hp: 10, atk: 4, mv: 3, rng: 4, x: 5, y: 7 },
  { t: "r", name: "rook", hp: 18, atk: 4, mv: 3, rng: 3, x: 2, y: 7 },
];

export const STAGES = [
  { name: "the pawn militia", intro: "a rabble of black pawns and a rook block the road. clear them out.", win: "all enemies", foes: [
    { t: "p", name: "pawn", hp: 6, atk: 2, mv: 1, rng: 1, x: 1, y: 1 },
    { t: "p", name: "pawn", hp: 6, atk: 2, mv: 1, rng: 1, x: 3, y: 1 },
    { t: "p", name: "pawn", hp: 6, atk: 2, mv: 1, rng: 1, x: 5, y: 1 },
    { t: "p", name: "pawn", hp: 6, atk: 2, mv: 1, rng: 1, x: 6, y: 2 },
    { t: "r", name: "rook", hp: 10, atk: 3, mv: 3, rng: 3, x: 3, y: 0 },
  ] },
  { name: "the chess dragon", intro: "a dragon built from black pieces. slay the head ♛ to end it. each living claw ♜ armors the head (−1 damage per claw). the claws can't move; the wings and tail can.", win: "dragon head", foes: [
    { t: "q", name: "dragon head", part: "head", hp: 22, atk: 5, mv: 0, rng: 5, fixed: true, x: 3, y: 0 },
    { t: "r", name: "dragon claw", part: "claw", hp: 10, atk: 3, mv: 0, rng: 2, fixed: true, x: 2, y: 2 },
    { t: "r", name: "dragon claw", part: "claw", hp: 10, atk: 3, mv: 0, rng: 2, fixed: true, x: 4, y: 2 },
    { t: "b", name: "dragon wing", part: "wing", hp: 8, atk: 3, mv: 3, rng: 3, x: 1, y: 1 },
    { t: "b", name: "dragon wing", part: "wing", hp: 8, atk: 3, mv: 3, rng: 3, x: 5, y: 1 },
    { t: "n", name: "dragon tail", part: "tail", hp: 10, atk: 4, x: 3, y: 3 },
  ] },
];

export function newBattle(stage = 0, party = null) {
  const s = { stage, units: [], nextId: 1, turn: 1, status: "playing", log: [] };
  const members = party || PARTY.map((p) => ({ ...p }));
  for (const p of members) mk(s, "p", p.t, p.x, p.y, p);
  for (const f of STAGES[stage].foes) mk(s, "e", f.t, f.x, f.y, f);
  s.log.push(STAGES[stage].intro);
  return s;
}

export const living = (s, side) => s.units.filter((u) => u.side === side && u.hp > 0);
export const unitAt = (s, x, y, ignoreId = 0) => s.units.find((u) => u.hp > 0 && u.x === x && u.y === y && u.id !== ignoreId) || null;

// Squares a unit can walk to (empty ones only). Sliders stop at the first unit.
export function legalMoves(s, u) {
  if (u.hp <= 0 || u.fixed || u.moved || u.acted) return [];
  const out = [];
  if (u.t === "n") {
    for (const [dx, dy] of KN) { const x = u.x + dx, y = u.y + dy; if (inBoard(x, y) && !unitAt(s, x, y)) out.push({ x, y }); }
  } else {
    const dirs = u.t === "k" ? ALL8 : u.t === "p" ? ORTH : DIRS[u.t];
    const reach = u.t === "k" || u.t === "p" ? 1 : u.mv;
    for (const [dx, dy] of dirs) {
      for (let i = 1; i <= reach; i++) {
        const x = u.x + dx * i, y = u.y + dy * i;
        if (!inBoard(x, y) || unitAt(s, x, y)) break;
        out.push({ x, y });
      }
    }
  }
  return out;
}

// Enemies that `u` could strike if it stood on (ax, ay). Sliders hit the first unit on a ray.
export function attackTargets(s, u, ax = u.x, ay = u.y) {
  if (u.hp <= 0 || u.acted) return [];
  const foes = [];
  const hit = (x, y) => { const v = inBoard(x, y) && unitAt(s, x, y, u.id); if (v && v.side !== u.side) foes.push(v); };
  if (u.t === "n") for (const [dx, dy] of KN) hit(ax + dx, ay + dy);
  else if (u.t === "k") for (const [dx, dy] of ALL8) hit(ax + dx, ay + dy);
  else if (u.t === "p") for (const [dx, dy] of DIAG) hit(ax + dx, ay + dy);
  else {
    for (const [dx, dy] of DIRS[u.t]) {
      for (let i = 1; i <= u.rng; i++) {
        const x = ax + dx * i, y = ay + dy * i;
        if (!inBoard(x, y)) break;
        const v = unitAt(s, x, y, u.id);
        if (v) { if (v.side !== u.side) foes.push(v); break; }
      }
    }
  }
  return foes;
}

// The dragon's head is armored by each claw still alive.
export function damageTo(s, att, tgt) {
  let d = att.atk;
  if (tgt.part === "head") d -= s.units.filter((u) => u.hp > 0 && u.part === "claw").length;
  return Math.max(1, d);
}

export function doMove(s, u, x, y) {
  if (s.status !== "playing" || !legalMoves(s, u).some((m) => m.x === x && m.y === y)) return false;
  u.x = x; u.y = y; u.moved = true;
  return true;
}

export function doAttack(s, u, tgt) {
  if (s.status !== "playing" || !attackTargets(s, u).includes(tgt)) return null;
  const d = damageTo(s, u, tgt);
  tgt.hp = Math.max(0, tgt.hp - d);
  u.acted = true; u.moved = true;
  s.log.push(`${u.name} hits ${tgt.name} for ${d}${tgt.hp <= 0 ? " — down" : ` (${tgt.hp}/${tgt.maxHp})`}.`);
  checkEnd(s);
  return d;
}

export function wait(s, u) { u.acted = true; u.moved = true; }

export function checkEnd(s) {
  const king = s.units.find((u) => u.side === "p" && u.t === "k");
  if (king.hp <= 0) { s.status = "lost"; return; }
  const st = STAGES[s.stage];
  const done = st.win === "dragon head" ? !s.units.some((u) => u.hp > 0 && u.part === "head") : !living(s, "e").length;
  if (done) {
    s.status = "won";
    if (st.win === "dragon head") for (const u of s.units) if (u.side === "e" && u.hp > 0) { u.hp = 0; s.log.push(`the ${u.name} crumbles.`); }
  }
}

// One enemy acts: pick the (square, target) pair that kills, else hits the king or the weakest, else walks closer.
export function enemyAct(s, e) {
  const players = living(s, "p");
  if (!players.length || e.hp <= 0) return;
  const spots = [{ x: e.x, y: e.y }, ...legalMoves(s, e)];
  let best = null;
  for (const sp of spots) {
    for (const t of attackTargets(s, e, sp.x, sp.y)) {
      const d = damageTo(s, e, t);
      const score = (d >= t.hp ? 100 : 0) + (t.t === "k" ? 20 : 0) + d * 2 - t.hp / 4 - (sp.x === e.x && sp.y === e.y ? 0 : 0.5);
      if (!best || score > best.score) best = { sp, t, score };
    }
  }
  if (best) {
    e.x = best.sp.x; e.y = best.sp.y;
    const d = damageTo(s, e, best.t);
    best.t.hp = Math.max(0, best.t.hp - d);
    s.log.push(`enemy ${e.name} hits your ${best.t.name} for ${d}${best.t.hp <= 0 ? " — down" : ` (${best.t.hp}/${best.t.maxHp})`}.`);
    checkEnd(s);
    return;
  }
  if (e.fixed) return;
  // no strike available: close in on the nearest of the party (king breaks ties)
  const near = (sp) => Math.min(...players.map((p) => dist(sp, p) - (p.t === "k" ? 0.25 : 0)));
  let mv = null;
  for (const sp of spots) if (!mv || near(sp) < near(mv)) mv = sp;
  e.x = mv.x; e.y = mv.y;
}

export function endTurn(s) {
  if (s.status !== "playing") return;
  s.units.forEach((u) => { if (u.hp > 0 && u.side === "e") { u.moved = false; u.acted = false; } });
  for (const e of living(s, "e")) {
    if (s.status !== "playing") break;
    enemyAct(s, e);
  }
  s.turn++;
  for (const u of s.units) { u.moved = false; u.acted = false; }
}

// Carry the party to the next battle: healed up, the fallen revived at half health, +2 hp and +1 attack.
export function nextBattle(s) {
  const party = s.units.filter((u) => u.side === "p").map((u, i) => {
    const base = PARTY[i];
    const hp = u.maxHp + 2;
    return { ...base, hp, atk: u.atk + 1, mv: u.mv, rng: u.rng, x: base.x, y: base.y };
  });
  const n = newBattle(s.stage + 1, party);
  // revived members start at half health
  s.units.filter((u) => u.side === "p").forEach((old, i) => {
    const nu = n.units[i];
    nu.hp = old.hp <= 0 ? Math.ceil(nu.maxHp / 2) : nu.maxHp;
  });
  return n;
}

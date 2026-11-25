// Pure rules for Chess Tactics — no DOM, so tests can import it.
// A campaign of grid battles (Final Fantasy Tactics style). Your roster of chess
// pieces moves with real chess moves, strikes anything it could capture, and has
// one special ability. Between battles you level up, recruit, equip and revive.
// Maps, objectives and enemy squads are generated from the campaign seed; the
// last battle is always the chess dragon.
export const SIZE = 8;
export const BATTLES = 7;
// Six pieces fill the two deployment rows exactly (8 + 8 squares is plenty), and
// keeping the squad small keeps every piece's fate matter.
export const MAX_ROSTER = 6;
// Level 8 keeps the stat curve inside what the generated enemies were tuned for.
export const MAX_LEVEL = 8;
export const GLYPH = {
  p: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  e: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8 = [...ORTH, ...DIAG];
const DIRS = { r: ORTH, b: DIAG, q: ALL8, k: ALL8 };

// Terrain: "." floor, "#" wall (blocks everything but knights' jumps), "c" cover
// (-1 damage taken), "l" lava (3 damage at the end of your side's turn),
// "h" chapel (heals 3 at the end of your side's turn), "x" exit.
export const LAVA_DMG = 3, CHAPEL_HEAL = 3;

export const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function makeRng(seed) {
  let a = 2166136261;
  for (const ch of String(seed)) { a ^= ch.charCodeAt(0); a = Math.imul(a, 16777619); }
  a >>>= 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickOf = (rng, a) => a[Math.floor(rng() * a.length)];
const shuffled = (rng, a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ---- classes, abilities, gear -----------------------------------------
export const BASE = {
  k: { name: "king", hp: 16, atk: 3, mv: 1, rng: 1 },
  p: { name: "pawn", hp: 8, atk: 3, mv: 1, rng: 1 },
  n: { name: "knight", hp: 12, atk: 5, mv: 0, rng: 0 },
  b: { name: "bishop", hp: 10, atk: 4, mv: 3, rng: 4 },
  r: { name: "rook", hp: 16, atk: 4, mv: 3, rng: 3 },
  q: { name: "queen", hp: 14, atk: 5, mv: 4, rng: 4 },
};
export const RECRUIT_COST = { p: 6, n: 14, b: 14, r: 18, q: 40 };
export const ABILITIES = {
  k: { name: "Rally", cd: 3, text: "heal every ally within 2 squares (and yourself) for 4" },
  n: { name: "Fork", cd: 3, text: "strike every enemy you can attack, all at once" },
  b: { name: "Bless", cd: 2, text: "heal an ally in your line of sight for 5" },
  r: { name: "Castle", cd: 2, text: "swap places with your king if you can see him" },
  q: { name: "Sweep", cd: 3, text: "strike every adjacent enemy" },
  p: null,
};
export const GEAR = [
  { id: "whetstone", name: "Whetstone", cost: 8, text: "+2 attack", fx: { atk: 2 } },
  { id: "plate", name: "Plate", cost: 8, text: "+5 hp", fx: { hp: 5 } },
  { id: "shield", name: "Tower Shield", cost: 12, text: "take 1 less damage", fx: { dr: 1 } },
  { id: "lance", name: "Lance", cost: 12, text: "+1 attack range (not knights)", fx: { rng: 1 } },
  { id: "boots", name: "Boots", cost: 10, text: "+1 move (not knights)", fx: { mv: 1 } },
  { id: "fang", name: "Vampire Fang", cost: 14, text: "heal 2 whenever you hit", fx: { vamp: 2 } },
  { id: "banner", name: "War Banner", cost: 24, text: "+3 attack, +3 hp", fx: { atk: 3, hp: 3 } },
];
export const gearById = (id) => GEAR.find((g) => g.id === id) || null;

// ---- units and battle state --------------------------------------------
function mk(s, side, t, x, y, o) {
  const u = { id: s.nextId++, side, t, x, y, hp: o.hp, maxHp: o.hp, atk: o.atk, mv: o.mv ?? 3, rng: o.rng ?? 3, name: o.name || BASE[t].name,
    fixed: !!o.fixed, part: o.part || null, moved: false, acted: false, cd: 0, ai: o.ai || "aggro", uid: o.uid ?? null, dr: o.dr || 0, vamp: o.vamp || 0,
    commander: !!o.commander, cost: o.cost || 1, xpValue: o.xpValue || 0, xpGain: 0, kills: 0, lvl: o.lvl || 1, gear: o.gear || null, promoted: false, from: null };
  s.units.push(u);
  return u;
}
const emptyState = () => ({ units: [], nextId: 1, turn: 1, status: "playing", log: [], fx: [], terrain: Array.from({ length: SIZE }, () => Array(SIZE).fill(".")), objective: { kind: "rout", text: "defeat every enemy" }, turnLimit: 0, reinforce: null, stage: 0, kills: 0, rage: false, rng: Math.random, title: "" });

export const tileAt = (s, x, y) => (inBoard(x, y) ? s.terrain[y][x] : "#");
export const living = (s, side) => s.units.filter((u) => u.side === side && u.hp > 0);
export const unitAt = (s, x, y, ignoreId = 0) => s.units.find((u) => u.hp > 0 && u.x === x && u.y === y && u.id !== ignoreId) || null;
const walkable = (s, x, y) => inBoard(x, y) && tileAt(s, x, y) !== "#";
const fwd = (u) => (u.side === "p" ? -1 : 1);

// Squares a unit can walk to (empty ones only). Sliders stop at the first obstacle.
export function legalMoves(s, u) {
  if (u.hp <= 0 || u.fixed || u.moved || u.acted) return [];
  const out = [];
  if (u.t === "n") {
    for (const [dx, dy] of KN) { const x = u.x + dx, y = u.y + dy; if (walkable(s, x, y) && !unitAt(s, x, y)) out.push({ x, y }); }
    return out;
  }
  // pawns march forward (up to their move) or sidestep one square
  const walk = (dx, dy, reach) => {
    for (let i = 1; i <= reach; i++) {
      const x = u.x + dx * i, y = u.y + dy * i;
      if (!walkable(s, x, y) || unitAt(s, x, y)) break;
      out.push({ x, y });
    }
  };
  if (u.t === "p") { walk(0, fwd(u), u.mv); walk(1, 0, 1); walk(-1, 0, 1); return out; }
  for (const [dx, dy] of DIRS[u.t]) walk(dx, dy, u.mv);
  return out;
}

// Every square `u` threatens from (ax, ay), empty or not. Rays stop at walls and
// include the first unit they meet. Knights jump.
export function attackSquares(s, u, ax = u.x, ay = u.y) {
  const out = [];
  if (u.t === "n") {
    for (const [dx, dy] of KN) { const x = ax + dx, y = ay + dy; if (walkable(s, x, y)) out.push({ x, y }); }
    return out;
  }
  const dirs = u.t === "p" ? [[1, fwd(u)], [-1, fwd(u)]] : DIRS[u.t];
  for (const [dx, dy] of dirs) {
    for (let i = 1; i <= u.rng; i++) {
      const x = ax + dx * i, y = ay + dy * i;
      if (!walkable(s, x, y)) break;
      out.push({ x, y });
      if (unitAt(s, x, y, u.id)) break;
    }
  }
  return out;
}

// Enemies that `u` could strike if it stood on (ax, ay).
export function attackTargets(s, u, ax = u.x, ay = u.y) {
  if (u.hp <= 0 || u.acted) return [];
  const foes = [];
  for (const q of attackSquares(s, u, ax, ay)) { const v = unitAt(s, q.x, q.y, u.id); if (v && v.side !== u.side && !foes.includes(v)) foes.push(v); }
  return foes;
}

// Damage after armor: dragon claws shield the head, cover and shields blunt hits.
export function damageTo(s, att, tgt) {
  let d = att.atk;
  if (tgt.part === "head") d -= s.units.filter((u) => u.hp > 0 && u.part === "claw").length;
  if (tileAt(s, tgt.x, tgt.y) === "c") d -= 1;
  d -= tgt.dr || 0;
  return Math.max(1, d);
}

function floater(s, x, y, text, kind) { s.fx.push({ x, y, text, kind }); }

function dealDamage(s, att, tgt, who) {
  const d = damageTo(s, att, tgt);
  tgt.hp = Math.max(0, tgt.hp - d);
  floater(s, tgt.x, tgt.y, "-" + d, tgt.side === "p" ? "hurt" : "hit");
  s.log.push(`${who} ${att.name} hits ${tgt.side === "p" ? "your " : ""}${tgt.name} for ${d}${tgt.hp <= 0 ? " — down" : ` (${tgt.hp}/${tgt.maxHp})`}.`);
  if (att.vamp && att.hp > 0) { att.hp = Math.min(att.maxHp, att.hp + att.vamp); floater(s, att.x, att.y, "+" + att.vamp, "heal"); }
  if (tgt.hp <= 0) { att.kills++; att.xpGain += tgt.xpValue; if (att.side === "p") s.kills++; }
  return d;
}

function promote(s, u) {
  if (u.t !== "p" || u.hp <= 0 || u.y !== (u.side === "p" ? 0 : SIZE - 1)) return;
  u.t = "q"; u.name = "queen"; u.maxHp += 6; u.hp += 6; u.atk += 2; u.mv = 4; u.rng = 4; u.promoted = true; u.cost = 9;
  floater(s, u.x, u.y, "♕!", "heal");
  s.log.push(`${u.side === "p" ? "your" : "enemy"} pawn reaches the last rank and becomes a queen!`);
}

export function doMove(s, u, x, y) {
  if (s.status !== "playing" || !legalMoves(s, u).some((m) => m.x === x && m.y === y)) return false;
  u.from = { x: u.x, y: u.y };
  u.x = x; u.y = y; u.moved = true;
  promote(s, u);
  checkEnd(s);
  return true;
}

export function doAttack(s, u, tgt) {
  if (s.status !== "playing" || !attackTargets(s, u).includes(tgt)) return null;
  const d = dealDamage(s, u, tgt, "");
  u.acted = true; u.moved = true;
  checkEnd(s);
  return d;
}

export function wait(s, u) { u.acted = true; u.moved = true; }

// ---- abilities ------------------------------------------------------------
// Targets for u's ability: allied/enemy units, or [u] itself for "no choice"
// abilities. An empty list means it would do nothing right now.
export function abilityTargets(s, u) {
  const ab = ABILITIES[u.t];
  if (!ab || u.hp <= 0 || u.acted || u.cd > 0 || u.fixed) return [];
  const allies = living(s, u.side);
  if (u.t === "k") return allies.some((a) => dist(a, u) <= 2 && a.hp < a.maxHp) ? [u] : [];
  if (u.t === "n") return attackTargets(s, u).length ? [u] : [];
  if (u.t === "q") return living(s, u.side === "p" ? "e" : "p").some((e) => dist(e, u) === 1) ? [u] : [];
  const seen = attackSquares(s, u).map((q) => unitAt(s, q.x, q.y, u.id)).filter((v) => v && v.side === u.side);
  if (u.t === "b") return seen.filter((a) => a.hp < a.maxHp);
  if (u.t === "r") return seen.filter((a) => a.t === "k");
  return [];
}

export function doAbility(s, u, target) {
  if (s.status !== "playing" || !abilityTargets(s, u).includes(target)) return false;
  const ab = ABILITIES[u.t];
  const heal = (a, n) => { const g = Math.min(n, a.maxHp - a.hp); a.hp += g; if (g) floater(s, a.x, a.y, "+" + g, "heal"); };
  if (u.t === "k") { for (const a of living(s, u.side)) if (dist(a, u) <= 2) heal(a, 4); s.log.push("the king rallies the troops."); }
  else if (u.t === "n") { s.log.push("the knight forks!"); for (const e of attackTargets(s, u)) dealDamage(s, u, e, ""); }
  else if (u.t === "q") { s.log.push("the queen sweeps the board."); for (const e of living(s, "e")) if (dist(e, u) === 1) dealDamage(s, u, e, ""); }
  else if (u.t === "b") { heal(target, 5); s.log.push(`the bishop blesses your ${target.name}.`); }
  else if (u.t === "r") {
    [u.x, target.x] = [target.x, u.x]; [u.y, target.y] = [target.y, u.y];
    s.log.push("the rook castles: king and rook trade places.");
  }
  u.cd = ab.cd; u.acted = true; u.moved = true;
  checkEnd(s);
  return true;
}

// ---- end conditions ----------------------------------------------------
export function checkEnd(s) {
  if (s.status !== "playing") return;
  const king = s.units.find((u) => u.side === "p" && u.t === "k");
  if (!king || king.hp <= 0) { s.status = "lost"; return; }
  const k = s.objective.kind;
  let done = false;
  if (k === "rout") done = !living(s, "e").length;
  else if (k === "assassin") done = !s.units.some((u) => u.hp > 0 && u.commander);
  else if (k === "dragon") done = !s.units.some((u) => u.hp > 0 && u.part === "head");
  else if (k === "reach") done = tileAt(s, king.x, king.y) === "x";
  else if (k === "survive") done = s.turn > s.turnLimit;
  if (!done) return;
  s.status = "won";
  if (k === "dragon") for (const u of s.units) if (u.side === "e" && u.hp > 0) { u.hp = 0; s.log.push(`the ${u.name} crumbles.`); }
}

// ---- enemy phase ----------------------------------------------------------
const threatened = (s, sp, side) => living(s, side).filter((p) => attackSquares(s, p).some((q) => q.x === sp.x && q.y === sp.y)).length;

// One enemy acts according to its temperament:
//  aggro: best trade available, else advance.  guard: holds until you get close (or it's hurt).
//  sniper: strikes from where it can't be hit back.  assassin: ignores everyone but your king.
export function enemyAct(s, e) {
  const players = living(s, "p");
  if (!players.length || e.hp <= 0) return null;
  const spots = [{ x: e.x, y: e.y }, ...legalMoves(s, e)];
  const king = players.find((p) => p.t === "k");
  const awake = e.ai !== "guard" || e.hp < e.maxHp || players.some((p) => dist(p, e) <= (e.fixed ? e.rng : e.mv + e.rng + 1));
  if (!awake) return null;
  let best = null;
  for (const sp of spots) {
    const here = sp.x === e.x && sp.y === e.y;
    const lava = tileAt(s, sp.x, sp.y) === "l" ? -6 : 0, cover = tileAt(s, sp.x, sp.y) === "c" ? 1.5 : 0;
    const fear = e.ai === "sniper" ? threatened(s, sp, "p") * 3 : 0;
    for (const t of attackTargets(s, e, sp.x, sp.y)) {
      const d = damageTo(s, e, t);
      const score = (d >= t.hp ? 100 : 0) + (t.t === "k" ? 20 : 0) + (e.ai === "assassin" && t.t === "k" ? 40 : 0) + d * 2 - t.hp / 4 - (here ? 0 : 0.5) + lava + cover - fear;
      if (!best || score > best.score) best = { sp, t, score };
    }
  }
  const from = { x: e.x, y: e.y };
  if (best) {
    e.x = best.sp.x; e.y = best.sp.y; e.from = from;
    promote(s, e);
    dealDamage(s, e, best.t, "enemy");
    checkEnd(s);
    return { id: e.id, from, to: { x: e.x, y: e.y }, target: best.t };
  }
  if (e.fixed) return null;
  // nothing to hit: close in (assassins hunt the king, snipers keep their distance from everyone else)
  const goal = e.ai === "assassin" && king ? [king] : players;
  const near = (sp) => Math.min(...goal.map((p) => dist(sp, p) - (p.t === "k" ? 0.25 : 0))) + (tileAt(s, sp.x, sp.y) === "l" ? 6 : 0) + (e.ai === "sniper" ? threatened(s, sp, "p") * 2 : 0);
  let mv = null;
  for (const sp of spots) if (!mv || near(sp) < near(mv)) mv = sp;
  e.x = mv.x; e.y = mv.y;
  if (e.x !== from.x || e.y !== from.y) { e.from = from; promote(s, e); }
  checkEnd(s);
  return { id: e.id, from, to: { x: e.x, y: e.y }, target: null };
}

function terrainTick(s, side) {
  for (const u of living(s, side === "p" ? "p" : "e")) {
    const t = tileAt(s, u.x, u.y);
    if (t === "l") {
      u.hp = Math.max(0, u.hp - LAVA_DMG); floater(s, u.x, u.y, "-" + LAVA_DMG, side === "p" ? "hurt" : "hit");
      s.log.push(`${side === "p" ? "your " : "enemy "}${u.name} burns in the lava${u.hp <= 0 ? " — down" : ""}.`);
    } else if (t === "h" && u.hp < u.maxHp) { const g = Math.min(CHAPEL_HEAL, u.maxHp - u.hp); u.hp += g; floater(s, u.x, u.y, "+" + g, "heal"); }
  }
}

export function beginEnemyPhase(s) {
  if (s.status !== "playing") return [];
  terrainTick(s, "p");
  checkEnd(s);
  if (s.status !== "playing") return [];
  s.units.forEach((u) => { if (u.hp > 0 && u.side === "e") { u.moved = false; u.acted = false; } });
  return living(s, "e").map((e) => e.id);
}
export function enemyStep(s, id) {
  const e = s.units.find((u) => u.id === id);
  if (!e || e.hp <= 0 || s.status !== "playing") return null;
  return enemyAct(s, e);
}

function spawnEnemy(s, t, x, y, o = {}) {
  const b = BASE[t];
  return mk(s, "e", t, x, y, { hp: b.hp, atk: b.atk, mv: b.mv, rng: b.rng, ...o });
}
function freeSquare(s, rows, rng) {
  const cells = [];
  for (const y of rows) for (let x = 0; x < SIZE; x++) if (walkable(s, x, y) && !unitAt(s, x, y) && tileAt(s, x, y) !== "l") cells.push({ x, y });
  return cells.length ? pickOf(rng, cells) : null;
}

export function finishEnemyPhase(s) {
  if (s.status !== "playing") return;
  terrainTick(s, "e");
  checkEnd(s);
  if (s.status !== "playing") return;
  s.turn++;
  for (const u of s.units) { u.moved = false; u.acted = false; if (u.side === "p" && u.cd > 0) u.cd--; }
  if (s.objective.kind === "survive") checkEnd(s);
  if (s.status !== "playing") return;
  if (s.reinforce && s.turn % s.reinforce.every === 0) {
    for (let i = 0; i < s.reinforce.count; i++) {
      const sq = freeSquare(s, [0, 1], s.rng); if (!sq) break;
      const t = pickOf(s.rng, s.reinforce.types), sc = s.reinforce.scale;
      const b = BASE[t];
      spawnEnemy(s, t, sq.x, sq.y, { hp: Math.round(b.hp * sc.hp), atk: b.atk + sc.atk, name: "reinforcement " + b.name, cost: COST[t], xpValue: COST[t] * 2 + 1 });
      floater(s, sq.x, sq.y, "!", "hit");
    }
    s.log.push("reinforcements arrive from the north.");
  }
  const head = s.units.find((u) => u.part === "head");
  if (head && head.hp > 0 && !s.rage && head.hp <= head.maxHp / 2) {
    s.rage = true; head.atk += 2;
    s.log.push("the dragon roars. its head hits harder and pawns spill from its mouth!");
    for (let i = 0; i < 2; i++) { const sq = freeSquare(s, [1, 2], s.rng); if (sq) spawnEnemy(s, "p", sq.x, sq.y, { hp: 8, atk: 3, mv: 1, rng: 1, cost: 1, xpValue: 3 }); }
  }
}

export function endTurn(s) {
  for (const id of beginEnemyPhase(s)) enemyStep(s, id);
  finishEnemyPhase(s);
}

// Squares any enemy could hit next turn (for the "danger zones" overlay).
export function dangerSquares(s) {
  const set = new Set();
  for (const e of living(s, "e")) {
    const saved = [e.moved, e.acted]; e.moved = false; e.acted = false;
    const spots = [{ x: e.x, y: e.y }, ...legalMoves(s, e)];
    for (const sp of spots) for (const q of attackSquares(s, e, sp.x, sp.y)) set.add(q.x + "," + q.y);
    [e.moved, e.acted] = saved;
  }
  return set;
}

// ---- generating battles --------------------------------------------------------
const COST = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 6 };
export const DEPLOY_X = [3, 4, 2, 5, 1, 6, 0, 7];

function genTerrain(s, rng, n) {
  for (let tries = 0; tries < 40; tries++) {
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill("."));
    const put = (ch, rows) => { const x = Math.floor(rng() * SIZE), y = pickOf(rng, rows); if (g[y][x] === ".") g[y][x] = ch; };
    const walls = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < walls; i++) put("#", [1, 2, 3, 4, 5]);
    for (let i = 0; i < 4; i++) put("c", [1, 2, 3, 4, 5]);
    for (let i = 0; i < 1 + Math.min(3, Math.floor(n / 2)); i++) put("l", [2, 3, 4]);
    put("h", [3, 4, 5]);
    // every walkable square must be reachable from the king's deployment square
    const seen = new Set(["3,7"]), q = [[3, 7]];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of ORTH) { const nx = x + dx, ny = y + dy; if (inBoard(nx, ny) && g[ny][nx] !== "#" && !seen.has(nx + "," + ny)) { seen.add(nx + "," + ny); q.push([nx, ny]); } } }
    let ok = true;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (g[y][x] !== "#" && !seen.has(x + "," + y)) ok = false;
    if (ok) { s.terrain = g; return; }
  }
}

function genSquad(s, rng, n, budget, rows) {
  const pool = ["p"]; if (n >= 1) pool.push("n", "b"); if (n >= 2) pool.push("r"); if (n >= 3) pool.push("q");
  const sc = { hp: 1 + 0.1 * n, atk: Math.floor(n / 2) };
  let made = 0, elite = n >= 2;
  // The cap of 9 enemies is the board: more than that and there is nowhere left to stand.
  while (budget > 0 && made < 9) {
    const opts = pool.filter((t) => COST[t] <= budget);
    if (!opts.length) break;
    const t = pickOf(rng, opts), sq = freeSquare(s, rows, rng); if (!sq) break;
    budget -= COST[t]; made++;
    const b = BASE[t];
    const ai = t === "b" ? (rng() < 0.6 ? "sniper" : "aggro") : t === "n" ? (rng() < 0.4 ? "assassin" : "aggro") : pickOf(rng, ["aggro", "aggro", "guard"]);
    const el = elite && COST[t] >= 3; if (el) elite = false;
    spawnEnemy(s, t, sq.x, sq.y, { hp: Math.round(b.hp * sc.hp * (el ? 1.5 : 1)), atk: b.atk + sc.atk + (el ? 1 : 0), ai, name: (el ? "elite " : "") + b.name, cost: COST[t], xpValue: (COST[t] * 2 + 1) * (el ? 2 : 1) });
  }
  return sc;
}

const OBJECTIVES = ["rout", "assassin", "reach", "survive"];
// The whole campaign's objective order is fixed by the seed, so retries and replays match.
function planKinds(seed) {
  const rng = makeRng(seed + ":plan");
  const kinds = ["rout"];
  while (kinds.length < BATTLES - 1) kinds.push(pickOf(rng, OBJECTIVES.filter((k) => k !== kinds[kinds.length - 1])));
  kinds.push("dragon");
  return kinds;
}

export function dragonBattle(s) {
  s.objective = { kind: "dragon", text: "slay the dragon head ♛ (each living claw ♜ armors it by 1)" };
  s.title = "the chess dragon";
  s.terrain = Array.from({ length: SIZE }, () => Array(SIZE).fill("."));
  const t = s.terrain;
  t[3][1] = "l"; t[3][6] = "l"; t[4][0] = "#"; t[4][7] = "#"; t[5][2] = "c"; t[5][5] = "c"; t[4][3] = "h";
  const parts = [
    ["q", "head", 34, 5, 0, 5, true, 3, 0], ["r", "claw", 14, 3, 0, 2, true, 2, 2], ["r", "claw", 14, 3, 0, 2, true, 4, 2],
    ["b", "wing", 12, 3, 3, 3, false, 1, 1], ["b", "wing", 12, 3, 3, 3, false, 5, 1], ["n", "tail", 14, 4, 0, 0, false, 3, 3],
  ];
  for (const [ty, part, hp, atk, mv, rng, fixed, x, y] of parts) mk(s, "e", ty, x, y, { name: "dragon " + part, part, hp, atk, mv, rng, fixed, ai: fixed ? "aggro" : "assassin", xpValue: 14, cost: 6 });
  s.log.push("a dragon built from black pieces. slay the head to end it; each claw armors it. the claws can't move, the wings and tail can.");
}

// Place the roster on the bottom rows and build the battle for camp.n.
export function buildBattle(camp) {
  const s = emptyState();
  s.stage = camp.n; s.rng = makeRng(camp.seed + ":rolls:" + camp.n);
  const rng = makeRng(camp.seed + ":map:" + camp.n);
  const kind = planKinds(camp.seed)[camp.n];
  genTerrain(s, rng, camp.n);
  const members = camp.roster.filter((m) => m.alive);
  const order = members.slice().sort((a, b) => (a.t === "k" ? -1 : 0) - (b.t === "k" ? -1 : 0));
  order.forEach((m, i) => {
    const row = i < SIZE ? SIZE - 1 : SIZE - 2, x = DEPLOY_X[i % SIZE];
    const fx = m.gear ? gearById(m.gear).fx : {};
    const hp = m.hp + (fx.hp || 0);
    const u = mk(s, "p", m.t, x, row, { hp, atk: m.atk + (fx.atk || 0), mv: m.mv + (m.t === "n" ? 0 : fx.mv || 0), rng: m.rng + (m.t === "n" ? 0 : fx.rng || 0), name: m.name, uid: m.uid, dr: fx.dr, vamp: fx.vamp, lvl: m.lvl, gear: m.gear });
    u.cd = 0;
  });
  if (kind === "dragon") { dragonBattle(s); return s; }
  const n = camp.n;
  const budget = 4 + 3 * n;
  s.title = ["the road ahead", "a roadside ambush", "the toll bridge", "the burning orchard", "the siege camp", "the black gate"][Math.min(n, 5)];
  if (kind === "rout") {
    genSquad(s, rng, n, budget, [0, 1, 2, 3]);
    s.objective = { kind, text: "defeat every enemy" };
  } else if (kind === "assassin") {
    const sq = freeSquare(s, [0], rng);
    spawnEnemy(s, "k", sq.x, sq.y, { hp: 10 + 2 * n, atk: 3 + Math.floor(n / 2), mv: 1, rng: 1, ai: "guard", commander: true, name: "commander", cost: 6, xpValue: 25 });
    genSquad(s, rng, n, budget, [0, 1, 2, 3]);
    s.objective = { kind, text: "kill the enemy commander ♚ (it holds its ground until you come close)" };
  } else if (kind === "reach") {
    const x = Math.floor(rng() * SIZE);
    s.terrain[0][x] = "x";
    genSquad(s, rng, n, budget, [1, 2, 3]);
    s.objective = { kind, text: "march your king onto the golden flag ⚑ at the top" };
  } else { // survive
    s.turnLimit = 5 + Math.floor(n / 2);
    genSquad(s, rng, n, Math.round(budget * 0.5), [0, 1, 2]);
    const pool = ["p"]; if (n >= 1) pool.push("n", "b"); if (n >= 3) pool.push("r");
    s.reinforce = { every: 2, count: 1 + (n >= 3 ? 1 : 0), types: pool, scale: { hp: 1 + 0.1 * n, atk: Math.floor(n / 2) } };
    s.objective = { kind, text: `hold out until the end of turn ${s.turnLimit}; reinforcements keep coming` };
  }
  s.log.push(s.objective.text + ".");
  return s;
}

// ---- the campaign -------------------------------------------------------------------
export const xpNeeded = (lvl) => lvl * 8;
function member(camp, t, lvl = 1) {
  const b = BASE[t];
  const m = { uid: camp.nextUid++, t, name: b.name, lvl: 1, xp: 0, hp: b.hp, atk: b.atk, mv: b.mv, rng: b.rng, gear: null, alive: true };
  while (m.lvl < lvl) levelUp(m);
  return m;
}
function levelUp(m) { m.lvl++; m.hp += 2; if (m.lvl % 2 === 1) m.atk++; }

export function newCampaign(seed = Math.random().toString(36).slice(2, 8)) {
  const camp = { seed: String(seed), n: 0, gold: 10, inv: [], roster: [], nextUid: 1, retries: 0, snap: null, offers: null, state: "camp", kills: 0 };
  for (const t of ["k", "n", "b", "r"]) camp.roster.push(member(camp, t));
  camp.offers = makeOffers(camp);
  return camp;
}

export function makeOffers(camp) {
  const rng = makeRng(camp.seed + ":offers:" + camp.n);
  const types = ["p", "p", "n", "b", "r"]; if (camp.n >= 3) types.push("q");
  const rec = shuffled(rng, [...new Set(types)]).slice(0, 3).map((t) => ({ t, price: RECRUIT_COST[t] + camp.n }));
  const gear = shuffled(rng, GEAR).slice(0, 3).map((g) => ({ id: g.id, price: g.cost }));
  return { recruits: rec, gear };
}

export const reviveCost = (m) => 8 + 4 * m.lvl;
export function recruit(camp, i) {
  const o = camp.offers.recruits[i];
  if (!o || o.sold || camp.gold < o.price || camp.roster.length >= MAX_ROSTER) return false;
  camp.gold -= o.price; o.sold = true;
  camp.roster.push(member(camp, o.t, Math.max(1, Math.floor(camp.n / 2) + 1)));
  return true;
}
export function buyGear(camp, i) {
  const o = camp.offers.gear[i];
  if (!o || o.sold || camp.gold < o.price) return false;
  camp.gold -= o.price; o.sold = true; camp.inv.push(o.id);
  return true;
}
// gearId null takes the gear off. Whatever they were holding goes back to the bag.
export function equip(camp, uid, gearId) {
  const m = camp.roster.find((r) => r.uid === uid);
  if (!m || !m.alive) return false;
  if (gearId !== null) { const k = camp.inv.indexOf(gearId); if (k < 0) return false; camp.inv.splice(k, 1); }
  if (m.gear) camp.inv.push(m.gear);
  m.gear = gearId;
  return true;
}
export function revive(camp, uid) {
  const m = camp.roster.find((r) => r.uid === uid);
  if (!m || m.alive || camp.gold < reviveCost(m)) return false;
  camp.gold -= reviveCost(m); m.alive = true;
  return true;
}
// Dismiss a fallen piece for good, freeing its roster slot.
export function release(camp, uid) {
  const m = camp.roster.find((r) => r.uid === uid);
  if (!m || m.alive || m.t === "k") return false;
  camp.roster = camp.roster.filter((r) => r !== m);
  return true;
}

export function startBattle(camp) {
  camp.snap = JSON.stringify({ roster: camp.roster, gold: camp.gold, inv: camp.inv });
  camp.state = "battle";
  return buildBattle(camp);
}
export function retryBattle(camp) {
  const o = JSON.parse(camp.snap);
  camp.roster = o.roster; camp.gold = o.gold; camp.inv = o.inv; camp.retries++;
  return startBattle(camp);
}

// Apply a finished battle to the campaign. Returns a summary for the camp screen.
export function endBattle(camp, s) {
  if (s.status !== "won") { camp.state = "lost"; return null; }
  const sum = { gold: 8 + 3 * camp.n + 2 * s.kills, levels: [], fallen: [] };
  for (const u of s.units.filter((x) => x.side === "p")) {
    const m = camp.roster.find((r) => r.uid === u.uid); if (!m) continue;
    if (u.hp <= 0) { m.alive = false; sum.fallen.push(m.name); continue; }
    if (u.promoted) { m.t = "q"; m.name = "queen"; m.hp += 6; m.atk += 2; m.mv = 4; m.rng = 4; }
    m.xp += u.xpGain + 2;
    while (m.lvl < MAX_LEVEL && m.xp >= xpNeeded(m.lvl)) { m.xp -= xpNeeded(m.lvl); levelUp(m); sum.levels.push(`${m.name} reaches level ${m.lvl}`); }
    if (m.lvl >= MAX_LEVEL) m.xp = 0;
  }
  camp.gold += sum.gold; camp.kills += s.kills;
  camp.n++;
  if (camp.n >= BATTLES) camp.state = "won";
  else { camp.state = "camp"; camp.offers = makeOffers(camp); }
  return sum;
}

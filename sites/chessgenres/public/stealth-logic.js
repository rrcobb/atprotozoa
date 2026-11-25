// Pure rules for Chess Solid — no DOM, so tests can import it.
// A Metal Gear Solid-style infiltration. You are a lone king. Black guards
// patrol fixed routes, and a guard "sees" exactly the squares it could capture
// on (sliders are blocked by walls and other guards). Reach the exit unseen.
// If a guard spots you the base goes to ALERT: guards drop their routes and
// hunt you with real chess moves until you stay unseen for a few turns.
// A run is an endless descent: floor 1 is hand-built, later floors are
// generated from the run's seed (and proven winnable by `solve`), some need a
// keycard, and every floor is ranked against its par. Gadgets (coins, darts,
// a cardboard box) are earned by clean runs and spent for tempo.
export const SIZE = 8;
export const GLYPH = { k: "♔", p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8 = [...ORTH, ...DIAG];
const DIRS = { r: ORTH, b: DIAG, q: ALL8 };
export const ALERT_TURNS = 3; // turns of unseen play before the guards stand down: a stated game rule

export const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const key = (x, y) => x + "," + y;

// Routes are ping-ponged; every step must be a legal move for that piece (tests check this).
export const STAGES = [
  { name: "the dock", intro: "a rook walks the north wall and a knight hops the east side. use the crates (▣) to hide and the shadows to cross.",
    start: { x: 0, y: 7 }, exit: { x: 7, y: 0 },
    walls: [[3, 2], [3, 3], [3, 4], [5, 5], [6, 5]], boxes: [[1, 4], [4, 6]],
    guards: [
      { t: "r", name: "rook", route: [[0, 1], [1, 1], [2, 1]] },
      { t: "n", name: "knight", route: [[6, 3], [7, 5], [6, 3], [5, 1]] },
    ] },
  { name: "the tanker", intro: "two bishops cross the deck and a pawn watches the hatch. the bishops only ever see diagonals.",
    start: { x: 3, y: 7 }, exit: { x: 4, y: 0 },
    walls: [[1, 3], [2, 3], [5, 3], [6, 3], [2, 5], [5, 5]], boxes: [[3, 4], [0, 2]],
    guards: [
      { t: "b", name: "bishop", route: [[0, 5], [1, 4], [0, 3]] },
      { t: "b", name: "bishop", route: [[7, 4], [6, 5], [7, 6]] },
      { t: "p", name: "pawn", route: [[4, 2], [4, 3]] },
    ] },
  { name: "metal rook", intro: "the walking fortress: a giant ♜ that patrols two ranks at once, with a queen watching from the control room. get to the elevator.",
    start: { x: 0, y: 7 }, exit: { x: 7, y: 0 },
    walls: [[2, 5], [5, 5], [2, 2], [5, 2], [3, 0]], boxes: [[1, 4], [6, 4], [4, 3]],
    guards: [
      { t: "r", name: "metal rook", route: [[0, 3], [1, 3], [2, 3], [3, 3]] },
      { t: "q", name: "queen", route: [[7, 1], [6, 1], [7, 1], [7, 2]] },
      { t: "n", name: "knight", route: [[1, 6], [3, 5], [1, 6], [0, 4]] },
    ] },
];

export const GEAR_START = { coin: 3, box: 1, dart: 2 };
export const FREEZE_TURNS = 3;   // a coin clink holds one guard's attention this long
export const SLEEP_TURNS = 8;    // a tranquilised guard wakes after this many turns
export const DART_RANGE = 5;     // darts fly this far along a rank, file or diagonal
export const COIN_RANGE = 4;     // how far you can toss a coin
export const NOISE_RADIUS = 5;   // a guard must be this close to the clink to hear it
export const START_LIVES = 3;    // continues per run
const SOLVE_PERIOD_CAP = 120;    // patrols repeat quickly (periods 2-6); this only stops a runaway loop

function fromSpec(spec, meta = {}) {
  return {
    stage: meta.stage ?? 0, floor: meta.floor ?? 0, name: spec.name, turn: 1, status: "playing", alert: 0, seen: 0, log: [spec.intro],
    king: { ...spec.start }, exit: { ...spec.exit }, keycard: spec.keycard ? { ...spec.keycard } : null, hasKey: false, cloak: 0, par: null,
    gear: { ...(meta.gear || GEAR_START) },
    walls: spec.walls.map(([x, y]) => ({ x, y })), boxes: spec.boxes.map(([x, y]) => ({ x, y })),
    guards: spec.guards.map((g, id) => ({ id, t: g.t, name: g.name, route: g.route, i: 0, dir: 1, x: g.route[0][0], y: g.route[0][1], asleep: 0, freeze: 0 })),
  };
}

export function newLevel(stage = 0) {
  const s = fromSpec(STAGES[stage], { stage });
  s.par = solve(s);
  return s;
}

const isWall = (s, x, y) => s.walls.some((w) => w.x === x && w.y === y);
export const isBox = (s, x, y) => s.boxes.some((b) => b.x === x && b.y === y);
export const guardAt = (s, x, y) => s.guards.find((g) => g.x === x && g.y === y) || null;
export const hidden = (s) => s.cloak > 0 || isBox(s, s.king.x, s.king.y);

// Squares `g` sees given where every guard stands (positions: [{id,x,y}]).
export function visionOf(s, g, pos = s.guards) {
  const out = new Set();
  if (g.asleep > 0) return out;
  const blocked = (x, y) => isWall(s, x, y) || pos.some((p) => p.id !== g.id && p.x === x && p.y === y);
  const add = (x, y) => { if (inBoard(x, y) && !isWall(s, x, y)) out.add(key(x, y)); };
  if (g.t === "n") for (const [dx, dy] of KN) add(g.x + dx, g.y + dy);
  else if (g.t === "p") for (const dx of [-1, 1]) add(g.x + dx, g.y + 1);
  else for (const [dx, dy] of DIRS[g.t]) {
    for (let i = 1; i < SIZE; i++) {
      const x = g.x + dx * i, y = g.y + dy * i;
      if (!inBoard(x, y) || isWall(s, x, y)) break;
      out.add(key(x, y));
      if (blocked(x, y)) break;
    }
  }
  return out;
}

// Where each guard walks next if the base stays quiet.
export function nextPatrol(g) {
  if (g.route.length < 2 || g.asleep > 0 || g.freeze > 0) return { i: g.i, dir: g.dir, x: g.x, y: g.y };
  let dir = g.dir, i = g.i + dir;
  if (i < 0 || i >= g.route.length) { dir = -dir; i = g.i + dir; }
  return { i, dir, x: g.route[i][0], y: g.route[i][1] };
}

const sees = (s, pos) => !hidden(s) && s.guards.some((g) => visionOf(s, g, pos).has(key(s.king.x, s.king.y)));
const nextPositions = (s) => s.guards.map((g) => ({ id: g.id, ...nextPatrol(g) }));

// Squares that will be watched after the guards' next patrol step (what the player plans around).
export function dangerNext(s) {
  const pos = nextPositions(s), out = new Set();
  for (const g of s.guards) {
    const n = pos.find((p) => p.id === g.id);
    for (const k of visionOf(s, { ...g, x: n.x, y: n.y, asleep: Math.max(0, g.asleep - 1) }, pos)) out.add(k);
  }
  return out;
}

export function kingMoves(s) {
  if (s.status !== "playing") return [];
  const out = [];
  for (const [dx, dy] of ALL8) {
    const x = s.king.x + dx, y = s.king.y + dy;
    if (inBoard(x, y) && !isWall(s, x, y) && !guardAt(s, x, y)) out.push({ x, y });
  }
  return out;
}

// Moves a hunting guard may make: real chess moves, blocked by walls and bodies; the king's square is a capture.
function chaseMoves(s, g) {
  const out = [];
  const ok = (x, y) => inBoard(x, y) && !isWall(s, x, y);
  const free = (x, y) => ok(x, y) && !guardAt(s, x, y);
  if (g.t === "n") for (const [dx, dy] of KN) { if (free(g.x + dx, g.y + dy)) out.push({ x: g.x + dx, y: g.y + dy }); }
  else if (g.t === "p") { for (const [dx, dy] of ALL8) if (free(g.x + dx, g.y + dy)) out.push({ x: g.x + dx, y: g.y + dy }); }
  else for (const [dx, dy] of DIRS[g.t]) {
    for (let i = 1; i < SIZE; i++) {
      const x = g.x + dx * i, y = g.y + dy * i;
      if (!free(x, y)) break;
      out.push({ x, y });
    }
  }
  return out;
}
const reaches = (s, g) => {
  // can this guard capture the king from where it stands?
  const { x, y } = s.king;
  if (g.t === "n") return KN.some(([dx, dy]) => g.x + dx === x && g.y + dy === y);
  if (g.t === "p") return Math.max(Math.abs(g.x - x), Math.abs(g.y - y)) === 1;
  return visionOf(s, g).has(key(x, y));
};

function guardsAct(s) {
  if (s.alert > 0) {
    for (const g of s.guards) {
      if (g.asleep > 0) continue;
      if (reaches(s, g)) { s.status = "lost"; s.log.push(`the ${g.name} catches you. game over.`); return; }
      let best = null, bd = Infinity;
      for (const m of chaseMoves(s, g)) {
        const d = Math.max(Math.abs(m.x - s.king.x), Math.abs(m.y - s.king.y)) * 10 + Math.abs(m.x - s.king.x) + Math.abs(m.y - s.king.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) { g.x = best.x; g.y = best.y; }
      if (reaches(s, g)) { s.status = "lost"; s.log.push(`the ${g.name} catches you. game over.`); return; }
    }
    return;
  }
  const pos = nextPositions(s);
  for (const p of pos) if (p.x === s.king.x && p.y === s.king.y) {
    s.status = "lost"; s.log.push(`the ${s.guards[p.id].name} walks right into you. game over.`); return;
  }
  for (const p of pos) { const g = s.guards[p.id]; g.i = p.i; g.dir = p.dir; g.x = p.x; g.y = p.y; }
}

function endOfTurn(s) {
  guardsAct(s);
  if (s.status !== "playing") return;
  for (const g of s.guards) {
    if (g.freeze > 0) g.freeze--;
    if (g.asleep > 0 && --g.asleep === 0) s.log.push(`the ${g.name} wakes up, groggy.`);
  }
  s.turn++;
  const spotted = sees(s, s.guards);
  if (spotted) {
    if (s.alert === 0) s.log.push("!  you were spotted. ALERT — the guards are hunting you.");
    s.alert = ALERT_TURNS; s.seen++;
  } else if (s.alert > 0) {
    s.alert--;
    if (s.alert === 0) {
      for (const g of s.guards) { g.x = g.route[g.i][0]; g.y = g.route[g.i][1]; }
      s.log.push("they lost you. the guards go back to their posts.");
    } else s.log.push(`evasion… ${s.alert} more unseen turn${s.alert === 1 ? "" : "s"}.`);
  }
}

export function moveKing(s, x, y) {
  if (!kingMoves(s).some((m) => m.x === x && m.y === y)) return false;
  s.king.x = x; s.king.y = y;
  if (s.keycard && !s.hasKey && x === s.keycard.x && y === s.keycard.y) { s.hasKey = true; s.log.push("keycard acquired. the exit will open."); }
  if (x === s.exit.x && y === s.exit.y) {
    if (!s.keycard || s.hasKey) { s.status = "won"; s.log.push("you reach the exit."); return true; }
    s.log.push("the exit is locked. find the keycard (◆).");
  }
  endOfTurn(s);
  return true;
}
export function wait(s) { if (s.status !== "playing") return false; endOfTurn(s); return true; }
export const nextLevel = (s) => newLevel(s.stage + 1);

const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

// Gadget: toss a coin. The nearest awake guard within earshot stares at the noise for a few turns.
export function throwCoin(s, x, y) {
  if (s.status !== "playing" || s.gear.coin < 1 || s.alert > 0) return false;
  const d = cheb(x, y, s.king.x, s.king.y);
  if (!inBoard(x, y) || isWall(s, x, y) || d < 1 || d > COIN_RANGE) return false;
  let best = null, bd = Infinity;
  for (const g of s.guards) {
    if (g.asleep > 0) continue;
    const gd = cheb(g.x, g.y, x, y);
    if (gd <= NOISE_RADIUS && gd < bd) { bd = gd; best = g; }
  }
  s.gear.coin--;
  if (best) { best.freeze = FREEZE_TURNS; s.log.push(`clink. the ${best.name} stops to look.`); }
  else s.log.push("clink. nobody is close enough to hear it.");
  endOfTurn(s);
  return true;
}

// Gadget: tranquiliser dart along a line from the king; the first guard in the way falls asleep.
export function dartTarget(s, x, y) {
  const dx = Math.sign(x - s.king.x), dy = Math.sign(y - s.king.y);
  const ax = Math.abs(x - s.king.x), ay = Math.abs(y - s.king.y);
  if ((dx === 0 && dy === 0) || (ax !== 0 && ay !== 0 && ax !== ay)) return null;
  for (let i = 1; i <= DART_RANGE; i++) {
    const px = s.king.x + dx * i, py = s.king.y + dy * i;
    if (!inBoard(px, py) || isWall(s, px, py)) return null;
    const g = guardAt(s, px, py);
    if (g) return g.asleep > 0 ? null : g;
  }
  return null;
}
export function shoot(s, x, y) {
  if (s.status !== "playing" || s.gear.dart < 1) return false;
  const g = dartTarget(s, x, y);
  if (!g) return false;
  s.gear.dart--; g.asleep = SLEEP_TURNS;
  s.log.push(`thwip. the ${g.name} slumps asleep.`);
  endOfTurn(s);
  return true;
}

// Gadget: pull the cardboard box over your head for one turn. Sight can't find you; hands still can.
export function useBox(s) {
  if (s.status !== "playing" || s.gear.box < 1 || isBox(s, s.king.x, s.king.y)) return false;
  s.gear.box--; s.cloak = 1;
  s.log.push("you become a cardboard box.");
  endOfTurn(s);
  s.cloak = 0;
  return true;
}

// Fewest moves to the exit without ever being spotted (gadgets ignored), or null.
// Patrols are periodic and independent of the king while unalerted, so we search (time mod period, square, key).
export function solve(s) {
  const base = s.guards.map((g) => ({ id: g.id, t: g.t, route: g.route, i: g.i, dir: g.dir, x: g.x, y: g.y, asleep: 0, freeze: 0 }));
  const seq = [base.map((g) => ({ ...g }))];
  let cur = base.map((g) => ({ ...g }));
  for (let n = 0; n < SOLVE_PERIOD_CAP; n++) {
    cur = cur.map((g) => ({ ...g, ...nextPatrol(g) }));
    // at a route's ends the heading is irrelevant (the next step reverses it), so compare position only there
    if (cur.every((g, k) => g.i === base[k].i && (g.route.length < 2 || g.i === 0 || g.i === g.route.length - 1 || g.dir === base[k].dir))) break;
    seq.push(cur);
  }
  const L = seq.length;
  const danger = seq.map((pos) => {
    const out = new Set();
    for (const g of pos) for (const k of visionOf(s, g, pos)) out.add(k);
    return out;
  });
  const boxes = new Set(s.boxes.map((b) => key(b.x, b.y)));
  const seen = new Set();
  let frontier = [{ t: 0, x: s.king.x, y: s.king.y, k: s.hasKey, n: 0 }];
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      const here = seq[st.t], there = seq[(st.t + 1) % L];
      for (const [dx, dy] of [[0, 0], ...ALL8]) {
        const x = st.x + dx, y = st.y + dy;
        if (!inBoard(x, y) || isWall(s, x, y) || (dx || dy) && here.some((g) => g.x === x && g.y === y)) continue;
        const k = st.k || (s.keycard && x === s.keycard.x && y === s.keycard.y);
        if (x === s.exit.x && y === s.exit.y && (!s.keycard || k)) return st.n + 1;
        if (there.some((g) => g.x === x && g.y === y)) continue;
        if (!boxes.has(key(x, y)) && danger[(st.t + 1) % L].has(key(x, y))) continue;
        const sig = `${(st.t + 1) % L},${x},${y},${k ? 1 : 0}`;
        if (!seen.has(sig)) { seen.add(sig); next.push({ t: (st.t + 1) % L, x, y, k, n: st.n + 1 }); }
      }
    }
    frontier = next;
  }
  return null;
}

// ---- procedural floors ----------------------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };
// Every destination a guard of type t could walk to from (x,y) in one patrol step.
function steps(t, x, y, wall) {
  const out = [];
  if (t === "n") { for (const [dx, dy] of KN) if (inBoard(x + dx, y + dy) && !wall.has(key(x + dx, y + dy))) out.push([x + dx, y + dy]); return out; }
  if (t === "p") { for (const [dx, dy] of ORTH) if (inBoard(x + dx, y + dy) && !wall.has(key(x + dx, y + dy))) out.push([x + dx, y + dy]); return out; }
  for (const [dx, dy] of DIRS[t]) for (let i = 1; i < SIZE; i++) {
    const nx = x + dx * i, ny = y + dy * i;
    if (!inBoard(nx, ny) || wall.has(key(nx, ny))) break;
    out.push([nx, ny]);
  }
  return out;
}

// A floor from (floor, seed). Floors with a set piece (0, 4, 9) are hand-built; the rest are generated and
// only returned once `solve` proves a clean route exists.
export const SET_PIECES = { 0: 0, 4: 1, 9: 2 };
export function genSpec(floor, seed) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = rng(seed * 1009 + floor * 7919 + attempt * 31);
    const ri = (n) => Math.floor(r() * n);
    const start = { x: ri(SIZE), y: SIZE - 1 }, exit = { x: ri(SIZE), y: 0 };
    const taken = new Set([key(start.x, start.y), key(exit.x, exit.y)]);
    const pick = () => { for (let n = 0; n < 200; n++) { const x = ri(SIZE), y = ri(SIZE); if (!taken.has(key(x, y))) { taken.add(key(x, y)); return [x, y]; } } return null; };
    const walls = [], boxes = [];
    for (let i = 0, n = 5 + Math.min(3, floor >> 1); i < n; i++) { const p = pick(); if (p) walls.push(p); }
    const wallSet = new Set(walls.map(([x, y]) => key(x, y)));
    for (let i = 0, n = floor >= 8 ? 2 : 3; i < n; i++) { const p = pick(); if (p) boxes.push(p); }
    const wantKey = floor % 2 === 0 || floor >= 7;
    let keycard = null;
    if (wantKey) { const p = pick(); if (p) keycard = { x: p[0], y: p[1] }; }
    // five guards is about as many as an 8x8 floor holds and still stays winnable
    const count = Math.min(5, 2 + ((floor - 1) >> 1));
    const pool = floor < 3 ? ["r", "n", "b", "p"] : floor < 6 ? ["r", "n", "b", "p", "b", "n"] : ["r", "n", "b", "q", "n", "b", "r"];
    const guards = [];
    for (let gi = 0; gi < count; gi++) {
      const t = pool[ri(pool.length)];
      const sentry = floor >= 2 && r() < 0.25 && t !== "n" && t !== "p";
      let p = null;
      for (let n = 0; n < 60 && !p; n++) {
        const x = ri(SIZE), y = ri(SIZE - 1);
        if (!wallSet.has(key(x, y)) && !taken.has(key(x, y)) && cheb(x, y, start.x, start.y) > 2) p = [x, y];
      }
      if (!p) continue;
      const route = [p];
      if (!sentry) for (let len = 2 + ri(3); route.length < len;) {
        const [cx, cy] = route[route.length - 1];
        const opts = steps(t, cx, cy, wallSet).filter(([x, y]) => !taken.has(key(x, y)) && cheb(x, y, start.x, start.y) > 2);
        if (!opts.length) break;
        route.push(opts[ri(opts.length)]);
      }
      guards.push({ t, name: (route.length === 1 ? "sentry " : "") + NAMES[t], route });
    }
    if (guards.length < 2) continue;
    const spec = { name: `sub-level ${floor + 1}`, start, exit, walls, boxes, guards, keycard,
      intro: `floor ${floor + 1}: ${guards.length} guards${keycard ? ", exit locked, find the keycard ◆" : ""}.` };
    const probe = fromSpec(spec);
    if (solve(probe) !== null) return spec;
  }
  return STAGES[floor % STAGES.length];
}

// ---- the run: floors, score, continues, gear -------------------------------
export function newRun(seed = 1) {
  return { seed, floor: 0, score: 0, lives: START_LIVES, gear: { ...GEAR_START }, ranks: [], over: false, flawless: 0 };
}
export function floorLevel(run) {
  const sp = SET_PIECES[run.floor];
  const spec = sp !== undefined ? STAGES[sp] : genSpec(run.floor, run.seed);
  const s = fromSpec(spec, { stage: sp ?? 0, floor: run.floor, gear: run.gear });
  s.par = solve(s);
  if (sp !== undefined && sp > 0) s.log = [spec.intro];
  return s;
}
export function rankOf(s) {
  const par = s.par ?? s.turn;
  if (s.seen === 0 && s.turn <= par + 2) return "S";
  if (s.seen === 0) return "A";
  if (s.seen === 1) return "B";
  return "C";
}
const RANK_POINTS = { S: 300, A: 200, B: 120, C: 60 };
const GEAR_ORDER = ["coin", "dart", "box"];
// Bank a cleared floor: points, a rank, and gear for clean work.
export function completeFloor(run, s) {
  const rank = rankOf(s);
  const speed = Math.max(0, (s.par ?? s.turn) + 6 - s.turn) * 5;
  const points = RANK_POINTS[rank] + speed + run.floor * 10;
  run.score += points; run.ranks.push(rank);
  run.gear = { ...s.gear };
  const reward = [];
  if (rank !== "C") { const g = GEAR_ORDER[run.floor % 3]; run.gear[g]++; reward.push(g); }
  if (rank === "S") { run.gear.coin++; reward.push("coin"); }
  run.floor++;
  return { rank, points, reward };
}
// A caught (or abandoned) floor costs a continue; with none left the run is over.
export function failFloor(run) {
  if (run.lives > 0) { run.lives--; return "retry"; }
  run.over = true; return "over";
}

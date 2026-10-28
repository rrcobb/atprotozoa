// Pure rules for Chess Solid — no DOM, so tests can import it.
// A Metal Gear Solid-style infiltration. You are a lone king. Black guards
// patrol fixed routes, and a guard "sees" exactly the squares it could capture
// on (sliders are blocked by walls and other guards). Reach the exit unseen.
// If a guard spots you the base goes to ALERT: guards drop their routes and
// hunt you with real chess moves until you stay unseen for a few turns.
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

export function newLevel(stage = 0) {
  const st = STAGES[stage];
  const s = {
    stage, turn: 1, status: "playing", alert: 0, seen: 0, log: [st.intro],
    king: { ...st.start }, exit: { ...st.exit },
    walls: st.walls.map(([x, y]) => ({ x, y })), boxes: st.boxes.map(([x, y]) => ({ x, y })),
    guards: st.guards.map((g, id) => ({ id, t: g.t, name: g.name, route: g.route, i: 0, dir: 1, x: g.route[0][0], y: g.route[0][1] })),
  };
  return s;
}

const isWall = (s, x, y) => s.walls.some((w) => w.x === x && w.y === y);
export const isBox = (s, x, y) => s.boxes.some((b) => b.x === x && b.y === y);
export const guardAt = (s, x, y) => s.guards.find((g) => g.x === x && g.y === y) || null;
export const hidden = (s) => isBox(s, s.king.x, s.king.y);

// Squares `g` sees given where every guard stands (positions: [{id,x,y}]).
export function visionOf(s, g, pos = s.guards) {
  const out = new Set();
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
    for (const k of visionOf(s, { ...g, x: n.x, y: n.y }, pos)) out.add(k);
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
  if (x === s.exit.x && y === s.exit.y) {
    s.status = "won"; s.log.push(s.stage + 1 < STAGES.length ? "you reach the exit." : "you reach the elevator. mission complete.");
    return true;
  }
  endOfTurn(s);
  return true;
}
export function wait(s) { if (s.status !== "playing") return false; endOfTurn(s); return true; }
export const nextLevel = (s) => newLevel(s.stage + 1);

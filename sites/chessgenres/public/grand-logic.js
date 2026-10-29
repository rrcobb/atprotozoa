// Pure rules for Grand Chess Auto — no DOM, so tests can import it.
// A GTA-style open city. You start on foot (a king-step), steal parked cars
// that move like chess pieces, grab cash, and run over pawns at your peril:
// crime raises your wanted level and the police chase with real chess moves.
export const SIZE = 10;
export const GOAL = 1000; // cash that ends the run: a stated game rule
export const MAX_WANTED = 5; // five stars, like the genre it borrows from
export const CALM_TURNS = 6; // crime-free turns before one star fades
export const GLYPH = { k: "♔", p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };
export const COP_TYPES = ["p", "n", "b", "r", "q"]; // cop piece by wanted level; "p" steps like a king
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8 = [...ORTH, ...DIAG];
const DIRS = { r: ORTH, b: DIAG, q: ALL8 };

// '#' building, '.' street, '$' pay'n'spray (clears your wanted level)
export const MAP = [
  "..........",
  ".##.##.##.",
  ".##.##.##.",
  "..........",
  "..........",
  ".##.##.##.",
  ".##.##.##.",
  "..........",
  "..........",
  ".........$",
];
export const SPRAY = { x: 9, y: 9 };

export const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const isWall = (x, y) => MAP[y][x] === "#";

function rnd(s) {
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function newGame(seed = 1) {
  const s = {
    seed, turn: 1, status: "playing", cash: 0, wanted: 0, calm: 0, crimes: 0,
    me: { x: 0, y: 9, ride: "k" },
    cars: [{ x: 3, y: 3, t: "n" }, { x: 9, y: 4, t: "b" }, { x: 0, y: 7, t: "r" }, { x: 6, y: 8, t: "q" }],
    cash_at: [{ x: 9, y: 0 }, { x: 6, y: 4 }, { x: 3, y: 8 }],
    civs: [], cops: [],
    log: ["you're a nobody on foot at the docks. steal a car (step onto a parked piece), grab the $, make $" + GOAL + "."],
  };
  for (let i = 0; i < 6; i++) { const p = freeSquare(s); if (p) s.civs.push(p); }
  return s;
}

const find = (arr, x, y) => arr.find((o) => o.x === x && o.y === y) || null;
const meAt = (s, x, y) => s.me.x === x && s.me.y === y;
const occupied = (s, x, y) => isWall(x, y) || find(s.cars, x, y) || find(s.civs, x, y) || find(s.cops, x, y) || meAt(s, x, y) || find(s.cash_at, x, y) || (x === SPRAY.x && y === SPRAY.y);
function freeSquare(s, minDist = 0) {
  const opts = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
    if (!occupied(s, x, y) && Math.max(Math.abs(x - s.me.x), Math.abs(y - s.me.y)) >= minDist) opts.push({ x, y });
  return opts.length ? opts[Math.floor(rnd(s) * opts.length)] : null;
}

// Squares a piece of type t at (x,y) can move to. blocks(x,y) says a square
// stops a slider; canLand(x,y) says whether it may end its move there.
export function genMoves(t, x, y, blocks, canLand) {
  const out = [];
  const add = (nx, ny) => { if (inBoard(nx, ny) && !isWall(nx, ny) && canLand(nx, ny)) out.push({ x: nx, y: ny }); };
  if (t === "k" || t === "p") for (const [dx, dy] of ALL8) add(x + dx, y + dy);
  else if (t === "n") for (const [dx, dy] of KN) add(x + dx, y + dy);
  else for (const [dx, dy] of DIRS[t]) {
    for (let nx = x + dx, ny = y + dy; inBoard(nx, ny) && !isWall(nx, ny); nx += dx, ny += dy) {
      add(nx, ny);
      if (blocks(nx, ny)) break;
    }
  }
  return out;
}

const anyBody = (s, x, y) => find(s.cars, x, y) || find(s.civs, x, y) || find(s.cops, x, y);
export function myMoves(s) {
  return genMoves(s.me.ride, s.me.x, s.me.y, (x, y) => anyBody(s, x, y), () => true);
}

function crime(s, msg) {
  s.wanted = Math.min(MAX_WANTED, s.wanted + 1);
  s.calm = 0; s.crimes++;
  s.log.push(msg);
}

export function move(s, x, y) {
  if (s.status !== "playing") return false;
  if (!myMoves(s).some((m) => m.x === x && m.y === y)) return false;
  const from = { x: s.me.x, y: s.me.y };
  const hadWanted = s.wanted;
  s.log = [];
  const civ = find(s.civs, x, y), cop = find(s.cops, x, y), car = find(s.cars, x, y);
  if (civ) { s.civs.splice(s.civs.indexOf(civ), 1); s.cash += 20; crime(s, "you flattened a pedestrian. +$20."); }
  if (cop) { s.cops.splice(s.cops.indexOf(cop), 1); crime(s, "you took out a cop. they take it personally."); }
  s.me.x = x; s.me.y = y;
  if (car) {
    // carjack: take the car, leave the old ride parked where you came from
    const old = s.me.ride;
    s.cars.splice(s.cars.indexOf(car), 1);
    if (old !== "k") s.cars.push({ x: from.x, y: from.y, t: old });
    s.me.ride = car.t;
    crime(s, `you carjacked a ${GLYPH[car.t]}.`);
  }
  const cashHere = find(s.cash_at, x, y);
  if (cashHere) {
    s.cash_at.splice(s.cash_at.indexOf(cashHere), 1);
    s.cash += 100; s.log.push("job done. +$100.");
    const p = freeSquare(s, 3);
    if (p) s.cash_at.push(p);
  }
  if (x === SPRAY.x && y === SPRAY.y && s.wanted > 0) {
    s.wanted = 0; s.cops = []; s.calm = 0; s.log.push("pay'n'spray: new paint, new plates, no cops.");
  }
  if (s.cash >= GOAL) { s.status = "won"; s.log.push(`$${s.cash} in ${s.turn} turns. mission passed. respect +.`); return true; }
  endTurn(s, hadWanted);
  return true;
}

// Skip a turn (lie low).
export function wait(s) {
  if (s.status !== "playing") return;
  s.log = [];
  endTurn(s, s.wanted);
}

function endTurn(s, hadWanted) {
  // pedestrians wander
  for (const c of s.civs) {
    if (rnd(s) < 0.5) continue;
    const opts = ORTH.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).filter((p) => inBoard(p.x, p.y) && !occupied(s, p.x, p.y));
    if (opts.length) { const p = opts[Math.floor(rnd(s) * opts.length)]; c.x = p.x; c.y = p.y; }
  }
  // the heat fades after quiet turns
  if (s.wanted > 0 && s.calm >= 0) {
    if (s.wanted === hadWanted) s.calm++;
    if (s.calm >= CALM_TURNS) {
      s.wanted--; s.calm = 0; s.log.push("the heat dies down a little.");
      if (s.wanted === 0) { s.cops = []; s.log.push("the cops give up."); }
    }
  }
  // police arrive, and chase
  if (s.wanted > 0) {
    const want = s.wanted;
    if (s.cops.length < want && s.turn % 2 === 0) {
      const edge = [];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
        if ((x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) && !occupied(s, x, y) && Math.max(Math.abs(x - s.me.x), Math.abs(y - s.me.y)) >= 4) edge.push({ x, y });
      if (edge.length) {
        const p = edge[Math.floor(rnd(s) * edge.length)];
        s.cops.push({ x: p.x, y: p.y, t: COP_TYPES[want - 1] });
        s.log.push(`a ${GLYPH[COP_TYPES[want - 1]]} patrol car arrives.`);
      }
    }
    for (const c of s.cops) {
      const ms = genMoves(c.t, c.x, c.y,
        (x, y) => anyBody(s, x, y) || meAt(s, x, y),
        (x, y) => meAt(s, x, y) || !anyBody(s, x, y));
      if (!ms.length) continue;
      const d = (m) => Math.max(Math.abs(m.x - s.me.x), Math.abs(m.y - s.me.y)) * 10 + Math.abs(m.x - s.me.x) + Math.abs(m.y - s.me.y);
      ms.sort((a, b) => (meAt(s, b.x, b.y) ? 1 : 0) - (meAt(s, a.x, a.y) ? 1 : 0) || d(a) - d(b));
      c.x = ms[0].x; c.y = ms[0].y;
      if (meAt(s, c.x, c.y)) { s.status = "lost"; s.log.push(`WASTED. a ${GLYPH[c.t]} got you on turn ${s.turn}.`); return; }
    }
  }
  s.turn++;
}

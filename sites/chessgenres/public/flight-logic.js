// Pure rules for Microsoft Chess Flight Simulator — no DOM, so tests can import it.
// You fly a piece-shaped aircraft from the home field (bottom-left) to the
// destination airport (top-right). Each turn you make one chess move; fuel burns
// per square travelled. Storm cells drift on their own; ending a turn inside one
// costs hull and fuel. Mountains block sliders. Fuel pads top the tank up.
export const SIZE = 8;
export const STORM_HULL = 1;   // hull lost when a turn ends inside a storm cell
export const STORM_FUEL = 2;   // extra fuel burnt in the same case

export const CRAFT = {
  p: { name: "Cessna 172", glyph: "♟", fuel: 22, hull: 3, blurb: "one square any way. slow, frugal, forgiving." },
  n: { name: "Airbus Helicopter", glyph: "♞", fuel: 14, hull: 3, blurb: "hops over mountains. 2 fuel a jump." },
  b: { name: "Citation Jet", glyph: "♝", fuel: 13, hull: 3, blurb: "long diagonals only, so plan the zigzag." },
  r: { name: "Boeing 737", glyph: "♜", fuel: 18, hull: 5, blurb: "straight lines, tough airframe." },
  q: { name: "Airbus A380", glyph: "♛", fuel: 11, hull: 6, blurb: "goes anywhere, burns fuel like it's free." },
};

const DIRS = {
  p: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};
const JUMPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const inB = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const key = (x, y) => x + "," + y;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Legal moves from (x,y) given the mountain set: [{x,y,cost}]
export function movesFrom(type, x, y, mountains) {
  const out = [];
  if (type === "n") {
    for (const [dx, dy] of JUMPS) { const nx = x + dx, ny = y + dy; if (inB(nx, ny) && !mountains.has(key(nx, ny))) out.push({ x: nx, y: ny, cost: 2 }); }
    return out;
  }
  const limit = type === "p" ? 1 : SIZE;
  for (const [dx, dy] of DIRS[type]) {
    for (let i = 1; i <= limit; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (!inB(nx, ny) || mountains.has(key(nx, ny))) break;
      out.push({ x: nx, y: ny, cost: i });
    }
  }
  return out;
}

export function stormStep(st) {
  let { x, y, dx, dy } = st;
  if (!inB(x + dx, y)) dx = -dx;
  if (!inB(x, y + dy)) dy = -dy;
  return { x: x + dx, y: y + dy, dx, dy };
}

// Is there a flight plan that reaches the airport on fuel alone (storms ignored)?
export function reachable(type, start, dest, mountains, fuel) {
  const best = new Map([[key(start.x, start.y), 0]]);
  const q = [start];
  while (q.length) {
    const c = q.shift(), cc = best.get(key(c.x, c.y));
    for (const m of movesFrom(type, c.x, c.y, mountains)) {
      const nc = cc + m.cost, k = key(m.x, m.y);
      if (nc <= fuel && (!best.has(k) || nc < best.get(k))) { best.set(k, nc); q.push(m); }
    }
  }
  return best.has(key(dest.x, dest.y));
}

export function newFlight(type, seed = Math.floor(Math.random() * 1e9)) {
  const craft = CRAFT[type];
  for (let attempt = 0; attempt < 500; attempt++) {
    const r = rng(seed + attempt * 7919);
    const start = { x: 0, y: SIZE - 1 }, dest = { x: SIZE - 1, y: 0 };
    const taken = new Set([key(start.x, start.y), key(dest.x, dest.y)]);
    const free = () => { for (;;) { const x = Math.floor(r() * SIZE), y = Math.floor(r() * SIZE); if (!taken.has(key(x, y))) { taken.add(key(x, y)); return { x, y }; } } };
    const mountains = new Set();
    for (let i = 0; i < 7; i++) { const m = free(); mountains.add(key(m.x, m.y)); }
    const pads = [free(), free()];
    const storms = [];
    for (let i = 0; i < 3; i++) {
      const s = free();
      storms.push({ ...s, dx: r() < 0.5 ? 1 : -1, dy: r() < 0.5 ? 1 : 0 });
      if (storms[i].dx === 0 && storms[i].dy === 0) storms[i].dy = 1;
    }
    if (!reachable(type, start, dest, mountains, craft.fuel)) continue;
    return { type, seed, pos: { ...start }, dest, mountains, pads, storms, fuel: craft.fuel, maxFuel: craft.fuel, hull: craft.hull, turn: 0, status: "playing", log: [`${craft.name} cleared for takeoff. destination: top-right airport.`] };
  }
  throw new Error("no flyable map");
}

export const stormSet = (s) => new Set(s.storms.map((t) => key(t.x, t.y)));
export const nextStormSet = (s) => new Set(s.storms.map((t) => { const n = stormStep(t); return key(n.x, n.y); }));
export const legalMoves = (s) => movesFrom(s.type, s.pos.x, s.pos.y, s.mountains).filter((m) => m.cost <= s.fuel);

// Apply a move to (x,y). Returns false for an illegal one.
export function fly(s, x, y) {
  if (s.status !== "playing") return false;
  const m = legalMoves(s).find((v) => v.x === x && v.y === y);
  if (!m) return false;
  s.turn++; s.fuel -= m.cost; s.pos = { x, y };
  if (x === s.dest.x && y === s.dest.y) {
    s.status = "won"; s.log.push(`touchdown! landed with ${s.fuel} fuel and ${s.hull} hull left.`);
    return true;
  }
  if (s.pads.some((p) => p.x === x && p.y === y) && s.fuel < s.maxFuel) { s.fuel = s.maxFuel; s.log.push("refuelled at a fuel pad."); }
  s.storms = s.storms.map(stormStep);
  if (stormSet(s).has(key(x, y))) {
    s.hull -= STORM_HULL; s.fuel = Math.max(0, s.fuel - STORM_FUEL);
    s.log.push(`a storm rolls over you: hull −${STORM_HULL}, fuel −${STORM_FUEL}.`);
  }
  if (s.hull <= 0) { s.status = "lost"; s.log.push("the airframe gave out. crash."); }
  else if (legalMoves(s).length === 0) { s.status = "lost"; s.log.push("out of fuel with nowhere to glide. crash."); }
  return true;
}

export const score = (s) => s.status === "won" ? s.fuel * 10 + s.hull * 25 : 0;

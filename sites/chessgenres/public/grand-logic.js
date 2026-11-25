// Pure rules for Grand Chess Auto — no DOM, so tests can import it.
// A GTA-style open city built from a seed: a river with two bridges, blocks,
// plazas, safehouses, a piece garage and a body shop. You start on foot (a
// king-step), steal parked cars that move like chess pieces, take jobs (taxi
// fares, races, hits, bank heists), and the police answer with real chess
// moves and roadblocks. Bridges stop sliders cold, but knights jump the river.
// Get captured and you lose half your cash and a life; lose all lives and the
// run is over. Reach GOAL in cash to retire.
export const SIZE = 13;
export const GOAL = 2000; // cash that ends the run: a stated game rule
export const MAX_WANTED = 5; // five stars, like the genre it borrows from
export const CALM_TURNS = 6; // crime-free turns before one star fades
export const LIVES = 3; // times you can be wasted before the run ends
export const MAX_OFFERS = 3; // job markers on the board at once: enough choice without clutter
export const OFFER_TTL = 35; // turns a job marker waits before it's taken by someone else
export const RENT_EVERY = 10; // turns between safehouse rent payments
export const GLYPH = { k: "♔", p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };
export const COP_TYPES = ["p", "n", "b", "r", "q"]; // cop piece by wanted level; "p" steps like a king
export const JOBS = {
  taxi: { glyph: "🚕", name: "taxi fare" },
  heist: { glyph: "🏦", name: "bank heist" },
  race: { glyph: "🏁", name: "street race" },
  hit: { glyph: "☠", name: "contract" },
};
export const PROPS = {
  safe: { glyph: "🏠", name: "safehouse", price: 250, blurb: "clears your stars, banks heist loot, pays rent" },
  garage: { glyph: "🔧", name: "piece garage", price: 350, blurb: "swap your ride for the piece on the lift" },
  shop: { glyph: "🛡", name: "body shop", price: 200, blurb: "armour plating ($100) survives one capture" },
};
export const ARMOR_PRICE = 100;
export const RANKS = [[0, "errand boy"], [2, "wheelman"], [5, "enforcer"], [9, "capo"], [14, "kingpin"]];
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8 = [...ORTH, ...DIAG];
const DIRS = { r: ORTH, b: DIAG, q: ALL8 };

export const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

function rnd(s) {
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickOf = (s, arr) => arr[Math.floor(rnd(s) * arr.length)];

// ---- the city ---------------------------------------------------------------
// '#' building, '.' street, '~' river, '=' bridge. Streets every third line, 2x2 blocks between.
export function genMap(seed) {
  const s = { seed };
  const g = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => (x % 3 && y % 3 ? "#" : ".")));
  for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
    const q = rnd(s), x0 = bx * 3 + 1, y0 = by * 3 + 1;
    if (q < 0.2) for (let i = 0; i < 4; i++) g[y0 + (i >> 1)][x0 + (i & 1)] = ".";            // a plaza
    else if (q < 0.4) g[y0 + Math.floor(rnd(s) * 2)][x0 + Math.floor(rnd(s) * 2)] = ".";     // an alley
  }
  const vertical = rnd(s) < 0.5;
  const rc = pickOf(s, [4, 5, 7, 8]);
  const lanes = [0, 3, 6, 9, 12];
  const a = Math.floor(rnd(s) * lanes.length);
  const b = (a + 1 + Math.floor(rnd(s) * (lanes.length - 1))) % lanes.length;
  const bridges = new Set([lanes[a], lanes[b]]);
  for (let i = 0; i < SIZE; i++) {
    const ch = bridges.has(i) ? "=" : "~";
    if (vertical) g[i][rc] = ch; else g[rc][i] = ch;
  }
  return { map: g.map((row) => row.join("")), vertical, rc };
}
export const tile = (s, x, y) => s.map[y][x];
const blockAt = (s, x, y) => s.blocks.find((b) => b.x === x && b.y === y) || null;
// impassable and unlandable: buildings, open water, roadblocks. Only knights hop these.
export const solid = (s, x, y) => { const c = s.map[y][x]; return c === "#" || c === "~" || !!blockAt(s, x, y); };
const startBank = (s, x, y) => (s.river.vertical ? x < s.river.rc : y > s.river.rc);

export function newGame(seed = 1) {
  const { map, vertical, rc } = genMap(seed);
  const s = {
    seed, seed0: seed, turn: 1, status: "playing", cash: 0, loot: 0, wanted: 0, calm: 0, crimes: 0, done: 0, failed: 0, lives: LIVES,
    map, river: { vertical, rc }, home: { x: 0, y: SIZE - 1 },
    me: { x: 0, y: SIZE - 1, ride: "k", armor: false },
    cars: [], civs: [], cops: [], blocks: [], cash_at: [], props: [], offers: [], job: null, spray: null,
    radio: "Chess FM: you're listening to the rook hour.",
    log: ["you're a nobody on foot at the docks. steal a car (step onto a parked piece), take jobs from the markers, and retire with $" + GOAL + ". the river only has two bridges; knights jump it."],
  };
  // the spray shop sits on your bank of the river
  const sprayOpts = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
    if (map[y][x] === "." && startBank(s, x, y) && cheb(x, y, s.home.x, s.home.y) >= 4 && cheb(x, y, s.home.x, s.home.y) <= 8) sprayOpts.push({ x, y });
  s.spray = sprayOpts.length ? pickOf(s, sprayOpts) : { x: 3, y: SIZE - 1 };
  // properties: two safehouses, a garage, a body shop, spread out
  for (const t of ["safe", "garage", "shop", "safe"]) {
    const p = freeSquare(s, 3, (x, y) => s.props.every((o) => cheb(o.x, o.y, x, y) >= 4));
    if (p) s.props.push({ ...p, type: t, price: PROPS[t].price, owned: false, stock: t === "garage" ? pickOf(s, ["n", "b", "r"]) : null });
  }
  const carTypes = ["n", "n", "b", "b", "r", "r", "q"];
  for (let i = 0; i < 7; i++) { const p = freeSquare(s, 2); if (p) s.cars.push({ ...p, t: carTypes[i] }); }
  for (let i = 0; i < 2; i++) { const p = freeSquare(s, 3); if (p) s.cash_at.push(p); }
  for (let i = 0; i < 8; i++) { const p = freeSquare(s); if (p) s.civs.push(p); }
  for (let i = 0; i < 2; i++) spawnOffer(s);
  return s;
}

const find = (arr, x, y) => arr.find((o) => o.x === x && o.y === y) || null;
const meAt = (s, x, y) => s.me.x === x && s.me.y === y;
const markers = (s) => {
  const out = [];
  if (s.job) { if (s.job.to) out.push(s.job.to); if (s.job.cps) out.push(...s.job.cps); if (s.job.target) out.push(s.job.target); }
  return out;
};
const occupied = (s, x, y) => solid(s, x, y) || find(s.cars, x, y) || find(s.civs, x, y) || find(s.cops, x, y) || meAt(s, x, y) ||
  find(s.cash_at, x, y) || find(s.props, x, y) || find(s.offers, x, y) || (s.spray && x === s.spray.x && y === s.spray.y) || find(markers(s), x, y);
function freeSquare(s, minDist = 0, ok = () => true) {
  const opts = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
    if (s.map[y][x] === "." && !occupied(s, x, y) && cheb(x, y, s.me.x, s.me.y) >= minDist && ok(x, y)) opts.push({ x, y });
  return opts.length ? opts[Math.floor(rnd(s) * opts.length)] : null;
}

// Squares a piece of type t at (x,y) can move to. blocks(x,y) says a square
// stops a slider; canLand(x,y) says whether it may end its move there; solid(x,y)
// says it can't be entered or crossed at all (knights still hop over it).
export function genMoves(t, x, y, blocks, canLand, isSolid = () => false) {
  const out = [];
  const add = (nx, ny) => { if (inBoard(nx, ny) && !isSolid(nx, ny) && canLand(nx, ny)) out.push({ x: nx, y: ny }); };
  if (t === "k" || t === "p") for (const [dx, dy] of ALL8) add(x + dx, y + dy);
  else if (t === "n") for (const [dx, dy] of KN) add(x + dx, y + dy);
  else for (const [dx, dy] of DIRS[t]) {
    for (let nx = x + dx, ny = y + dy; inBoard(nx, ny) && !isSolid(nx, ny); nx += dx, ny += dy) {
      add(nx, ny);
      if (blocks(nx, ny)) break;
    }
  }
  return out;
}

const anyBody = (s, x, y) => find(s.cars, x, y) || find(s.civs, x, y) || find(s.cops, x, y) || (s.job && s.job.target && s.job.target.x === x && s.job.target.y === y);
export function myMoves(s) {
  return genMoves(s.me.ride, s.me.x, s.me.y, (x, y) => anyBody(s, x, y), () => true, (x, y) => solid(s, x, y));
}

function crime(s, msg, stars = 1) {
  s.wanted = Math.min(MAX_WANTED, s.wanted + stars);
  s.calm = 0; s.crimes++;
  s.log.push(msg);
}

// ---- jobs -------------------------------------------------------------------
function spawnOffer(s) {
  if (s.offers.length >= MAX_OFFERS) return;
  const kind = pickOf(s, ["taxi", "taxi", "race", "hit", "heist"]);
  if (kind === "heist" && s.offers.some((o) => o.kind === "heist")) return;
  const p = freeSquare(s, 3);
  if (p) s.offers.push({ ...p, kind, ttl: OFFER_TTL });
}

function acceptOffer(s, o) {
  if (s.job) { s.log.push(`finish your current job first (${JOBS[s.job.kind].name}).`); return false; }
  const here = { x: o.x, y: o.y };
  if (o.kind === "taxi") {
    if (s.me.ride === "k") { s.log.push("a fare is waiting, but you need wheels. steal a car first."); return false; }
    s.offers.splice(s.offers.indexOf(o), 1);
    const to = freeSquare(s, 5, (x, y) => cheb(x, y, here.x, here.y) >= 5);
    if (!to) return false;
    const d = cheb(to.x, to.y, here.x, here.y);
    s.job = { kind: "taxi", to, fare: 60 + 14 * d, deadline: s.turn + 2 * d + 4 };
    s.log.push(`taxi: drop them at the ⚑ within ${s.job.deadline - s.turn} turns for $${s.job.fare}.`);
  } else if (o.kind === "race") {
    s.offers.splice(s.offers.indexOf(o), 1);
    const cps = []; let prev = here, total = 0;
    for (let i = 0; i < 3; i++) {
      const p = freeSquare(s, 0, (x, y) => cheb(x, y, prev.x, prev.y) >= 4 && !cps.some((c) => c.x === x && c.y === y));
      if (!p) break;
      cps.push(p); total += cheb(p.x, p.y, prev.x, prev.y); prev = p;
    }
    if (cps.length < 3) return false;
    s.job = { kind: "race", cps, next: 0, fare: 300, deadline: s.turn + Math.ceil(total * 1.2) + 6 };
    s.log.push(`race: hit the three 🏁 in order within ${s.job.deadline - s.turn} turns for $300.`);
  } else if (o.kind === "hit") {
    s.offers.splice(s.offers.indexOf(o), 1);
    const target = freeSquare(s, 5);
    if (!target) return false;
    s.job = { kind: "hit", target, fare: 260, deadline: s.turn + 30 };
    s.log.push("contract: run the ☠ down for $260. it runs. (+1 star when you get it)");
  } else if (o.kind === "heist") {
    s.offers.splice(s.offers.indexOf(o), 1);
    s.loot += 450; s.job = { kind: "heist" };
    crime(s, "ALARM. you grab $450 of loot. get it to a safehouse or the spray shop to bank it.", Math.max(1, 3 - s.wanted));
  }
  return true;
}

function bankLoot(s) {
  if (s.loot > 0) { s.cash += s.loot; s.log.push(`loot banked: +$${s.loot}.`); s.loot = 0; }
  if (s.job && s.job.kind === "heist") { s.job = null; s.done++; }
}
function clearHeat(s, where) {
  if (s.wanted > 0) { s.wanted = 0; s.cops = []; s.blocks = []; s.calm = 0; s.log.push(where); }
}

function jobProgress(s, x, y) {
  const j = s.job;
  if (!j) return;
  if (j.kind === "taxi" && x === j.to.x && y === j.to.y) {
    const tip = s.wanted === 0 ? Math.round(j.fare * 0.25) : 0;
    s.cash += j.fare + tip; s.done++; s.job = null;
    s.log.push(`fare delivered: +$${j.fare}${tip ? ` and a $${tip} tip for a quiet ride` : ""}.`);
  } else if (j.kind === "race" && x === j.cps[j.next].x && y === j.cps[j.next].y) {
    j.next++;
    if (j.next >= j.cps.length) { s.cash += j.fare; s.done++; s.job = null; s.log.push(`race won: +$${j.fare}.`); }
    else s.log.push(`checkpoint ${j.next}/${j.cps.length}.`);
  } else if (j.kind === "hit" && x === j.target.x && y === j.target.y) {
    s.cash += j.fare; s.done++; s.job = null;
    crime(s, `contract fulfilled: +$${j.fare}. witnesses everywhere.`);
  }
}

// ---- properties ---------------------------------------------------------------
function enterProp(s, p) {
  if (!p.owned) { s.log.push(`${PROPS[p.type].name} for sale: $${p.price} (${PROPS[p.type].blurb}). lie low here to buy it.`); return; }
  if (p.type === "safe") { bankLoot(s); clearHeat(s, "safehouse: the heat drains away."); }
  else if (p.type === "garage") {
    const old = s.me.ride;
    if (p.stock && p.stock !== old) {
      s.me.ride = p.stock; s.me.armor = false;
      s.log.push(`garage: you roll out in a ${GLYPH[p.stock]}.`);
      p.stock = old === "k" ? null : old;
    } else s.log.push("the lift is empty. it restocks every few turns.");
  } else if (p.type === "shop") {
    if (s.me.ride === "k") s.log.push("the body shop only plates vehicles.");
    else if (s.me.armor) s.log.push("already plated.");
    else if (s.cash >= ARMOR_PRICE) { s.cash -= ARMOR_PRICE; s.me.armor = true; s.log.push(`armour plating fitted (-$${ARMOR_PRICE}): your ${GLYPH[s.me.ride]} survives one capture.`); }
    else s.log.push(`plating costs $${ARMOR_PRICE}.`);
  }
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
    s.me.ride = car.t; s.me.armor = false;
    crime(s, `you carjacked a ${GLYPH[car.t]}.`);
  }
  const cashHere = find(s.cash_at, x, y);
  if (cashHere) {
    s.cash_at.splice(s.cash_at.indexOf(cashHere), 1);
    s.cash += 100; s.log.push("job done. +$100.");
    const p = freeSquare(s, 3);
    if (p) s.cash_at.push(p);
  }
  const offer = find(s.offers, x, y);
  if (offer) acceptOffer(s, offer);
  jobProgress(s, x, y);
  const prop = find(s.props, x, y);
  if (prop) enterProp(s, prop);
  if (s.spray && x === s.spray.x && y === s.spray.y) {
    bankLoot(s);
    if (s.wanted > 0) clearHeat(s, "pay'n'spray: new paint, new plates, no cops.");
  }
  if (s.cash >= GOAL) { s.status = "won"; s.log.push(`$${s.cash} in ${s.turn} turns. you retire to a quiet square. mission passed. respect +.`); return true; }
  endTurn(s, hadWanted);
  return true;
}

// Skip a turn (lie low). On a property for sale, lying low closes the deal.
export function wait(s) {
  if (s.status !== "playing") return;
  s.log = [];
  const prop = find(s.props, s.me.x, s.me.y);
  if (prop && !prop.owned) {
    if (s.cash >= prop.price) { s.cash -= prop.price; prop.owned = true; s.log.push(`you bought the ${PROPS[prop.type].name} for $${prop.price}. ${PROPS[prop.type].blurb}.`); }
    else s.log.push(`the ${PROPS[prop.type].name} costs $${prop.price}; you have $${s.cash}.`);
  }
  endTurn(s, s.wanted);
}

export const rankTitle = (s) => RANKS.filter(([n]) => s.done >= n).pop()[1];
export const ownedCount = (s) => s.props.filter((p) => p.owned).length;
export const score = (s) => s.cash + s.done * 50 + ownedCount(s) * 100 + (s.status === "won" ? Math.max(0, 1500 - s.turn * 5) : 0);

const RADIO = {
  calm: ["Chess FM: the Sicilian is up three points on the Gambit this hour.", "Chess FM: traffic is light, except for the bishops. they only ever turn left.", "Chess FM: a pawn was spotted on the eighth rank and it's not talking to anyone.", "Chess FM: this next one goes out to everyone en passant.", "Chess FM: knights, please stop parking like that.", "Chess FM: it's a quiet night on the river."],
  hot: ["Chess FM: all units, the suspect moves like a piece. repeat, like a piece.", "Chess FM: roadblocks are up. do not try to castle through them.", "Chess FM: police are urging citizens not to take any pieces.", "Chess FM: the commissioner says the suspect will be mated by morning."],
  job: ["Chess FM: someone is late for something and it's costing them.", "Chess FM: the clock is ticking. fast ticking, in fact."],
  rich: ["Chess FM: sources say a new kingpin is rising in the east.", "Chess FM: the mayor, reached for comment, said \"touch-move\"."],
};
export function radioLine(s) {
  const bucket = s.wanted >= 2 ? "hot" : s.job && s.job.deadline && rnd(s) < 0.5 ? "job" : s.cash >= GOAL / 2 && rnd(s) < 0.5 ? "rich" : "calm";
  return pickOf(s, RADIO[bucket]);
}

// ---- the world turns ------------------------------------------------------------
function wasted(s, cop) {
  if (s.me.armor) {
    s.me.armor = false; s.cops.splice(s.cops.indexOf(cop), 1);
    s.log.push(`the ${GLYPH[cop.t]} rams you but your plating holds. the cruiser is wrecked.`);
    return false;
  }
  s.lives--;
  if (s.lives <= 0) { s.status = "lost"; s.log.push(`WASTED. a ${GLYPH[cop.t]} got you on turn ${s.turn}. no lives left.`); return true; }
  const lost = Math.floor(s.cash / 2);
  s.cash -= lost; s.loot = 0; s.job = null; s.wanted = 0; s.calm = 0; s.cops = []; s.blocks = [];
  s.cars = s.cars.filter((c) => !(c.x === s.home.x && c.y === s.home.y));
  s.civs = s.civs.filter((c) => !(c.x === s.home.x && c.y === s.home.y));
  s.me = { x: s.home.x, y: s.home.y, ride: "k", armor: false };
  s.turn++;
  s.log.push(`WASTED. a ${GLYPH[cop.t]} got you. you wake up at the docks, $${lost} lighter. ${s.lives} ${s.lives === 1 ? "life" : "lives"} left.`);
  return true;
}

function endTurn(s, hadWanted) {
  // pedestrians wander
  for (const c of s.civs) {
    if (rnd(s) < 0.5) continue;
    const opts = ORTH.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).filter((p) => inBoard(p.x, p.y) && !occupied(s, p.x, p.y));
    if (opts.length) { const p = opts[Math.floor(rnd(s) * opts.length)]; c.x = p.x; c.y = p.y; }
  }
  // rent and garage stock
  const owned = s.props.filter((p) => p.owned);
  if (s.turn % RENT_EVERY === 0) {
    const rent = owned.filter((p) => p.type === "safe").length * 25;
    if (rent) { s.cash += rent; s.log.push(`rent comes in: +$${rent}.`); }
  }
  if (s.turn % 6 === 0) for (const p of s.props) if (p.type === "garage" && !p.stock) p.stock = pickOf(s, ["n", "b", "r", "q"]);
  // job clocks, and the mark runs
  if (s.job && s.job.deadline && s.turn >= s.job.deadline) {
    s.log.push(`${JOBS[s.job.kind].name} failed: too slow.`); s.job = null; s.failed++;
  }
  if (s.job && s.job.kind === "hit" && rnd(s) < 0.7) {
    const t = s.job.target;
    const opts = ALL8.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy })).filter((p) => inBoard(p.x, p.y) && !occupied(s, p.x, p.y));
    opts.sort((a, b) => cheb(b.x, b.y, s.me.x, s.me.y) - cheb(a.x, a.y, s.me.x, s.me.y));
    if (opts.length) { t.x = opts[0].x; t.y = opts[0].y; }
  }
  for (const o of s.offers) o.ttl--;
  s.offers = s.offers.filter((o) => o.ttl > 0);
  if (rnd(s) < 0.3) spawnOffer(s);
  // the heat fades after quiet turns
  if (s.wanted > 0 && s.calm >= 0) {
    if (s.wanted === hadWanted) s.calm++;
    if (s.calm >= CALM_TURNS) {
      s.wanted--; s.calm = 0; s.log.push("the heat dies down a little.");
      if (s.wanted === 0) { s.cops = []; s.blocks = []; s.log.push("the cops give up."); }
    }
  }
  // police arrive, set up roadblocks, and chase
  for (const b of s.blocks) b.ttl--;
  s.blocks = s.blocks.filter((b) => b.ttl > 0);
  if (s.wanted > 0) {
    const want = s.wanted;
    if (s.cops.length < want && s.turn % 2 === 0) {
      const edge = [];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
        if ((x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) && s.map[y][x] === "." && !occupied(s, x, y) && cheb(x, y, s.me.x, s.me.y) >= 5) edge.push({ x, y });
      if (edge.length) {
        const p = edge[Math.floor(rnd(s) * edge.length)];
        s.cops.push({ x: p.x, y: p.y, t: COP_TYPES[want - 1] });
        s.log.push(`a ${GLYPH[COP_TYPES[want - 1]]} patrol car arrives.`);
      }
    }
    // at three stars the cops start closing streets, never more than want-2 at once so there's always a way out
    if (want >= 3 && s.blocks.length < want - 2 && s.turn % 3 === 0) {
      const p = freeSquare(s, 2, (x, y) => cheb(x, y, s.me.x, s.me.y) <= 4);
      if (p) { s.blocks.push({ ...p, ttl: 7 }); s.log.push("🚧 a roadblock goes up nearby."); }
    }
    for (const c of s.cops.slice()) {
      const ms = genMoves(c.t, c.x, c.y,
        (x, y) => anyBody(s, x, y) || meAt(s, x, y),
        (x, y) => meAt(s, x, y) || !anyBody(s, x, y), (x, y) => solid(s, x, y));
      if (!ms.length) continue;
      const d = (m) => cheb(m.x, m.y, s.me.x, s.me.y) * 10 + Math.abs(m.x - s.me.x) + Math.abs(m.y - s.me.y);
      ms.sort((a, b) => (meAt(s, b.x, b.y) ? 1 : 0) - (meAt(s, a.x, a.y) ? 1 : 0) || d(a) - d(b));
      c.x = ms[0].x; c.y = ms[0].y;
      if (meAt(s, c.x, c.y)) { if (wasted(s, c)) return; }
    }
  }
  s.radio = radioLine(s);
  s.turn++;
}

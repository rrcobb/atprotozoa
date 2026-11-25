// Pure rules for Microsoft Chess Flight Simulator — no DOM, so tests can import it.
// A career as a charter pilot. Each contract carries passengers, freight, mail or
// a medical case across one to three legs between airports; every turn you make
// one chess move and fuel burns per square travelled. Storm cells drift on their
// own (faster in a gale, hidden past a short radius in fog); ending a turn inside
// one costs hull and fuel. Mountains block sliders. Airports refuel you (for a
// price) and shelter you from storms, and they are the only cure for an
// emergency. Pay for contracts, buy upgrades and bigger aircraft, and retire
// with GOAL in the bank. A quick hop (corner to corner, no economy) is also here.
export const SIZE = 8;
export const STORM_HULL = 1;   // hull lost when a turn ends inside a storm cell
export const STORM_FUEL = 2;   // extra fuel burnt in the same case
export const GOAL = 3000;      // career cash that lets you retire: a stated game rule
export const REFUEL_COST = 3;  // dollars per unit of fuel at an airport
export const START_CASH = 200;
export const LOAN_FUEL = 22;   // the free Cessna's base tank (also what every contract is guaranteed flyable on)
const EMERGENCY_CHANCE = 0.07; // per turn after the second, during career flights
export const REROLL_COST = 25;
export const ABORT_FEE = 50;
export const AIRPORTS = ["ALD", "BRK", "CRN", "DLT", "EMB"]; // five airports are the most an 8x8 map holds with room to fly
export const WEATHER = {
  clear: { label: "clear skies", storms: 2, speed: 1, pay: 1, blurb: "two slow cells" },
  stormy: { label: "stormy", storms: 5, speed: 1, pay: 1.25, blurb: "five cells in the way" },
  gale: { label: "gale", storms: 3, speed: 2, pay: 1.35, blurb: "cells drift two squares a turn" },
  fog: { label: "fog", storms: 3, speed: 1, pay: 1.2, blurb: "you only see storms close by" },
};
export const CARGO = {
  passengers: { name: "passengers", glyph: "🧳", pay: 1.3, penalty: 25, blurb: "-$25 per hull point lost" },
  freight: { name: "freight", glyph: "📦", pay: 1, penalty: 0, blurb: "no complaints" },
  mail: { name: "express mail", glyph: "✉", pay: 1.2, penalty: 0, rush: 4, blurb: "half pay if late" },
  medical: { name: "medical flight", glyph: "🚑", pay: 1.7, penalty: 0, rush: 3, strict: true, blurb: "no pay if late" },
};
export const UPGRADES = {
  tank: { name: "extra tank", max: 3, price: [150, 300, 450], blurb: "+2 fuel on every aircraft" },
  plating: { name: "armour plating", max: 3, price: [200, 350, 500], blurb: "+1 hull on every aircraft" },
  radar: { name: "weather radar", max: 2, price: [250, 400], blurb: "see storms a turn further ahead and 1 square further in fog" },
};

export const CRAFT = {
  p: { price: 0, name: "Cessna 172", glyph: "♟", fuel: 22, hull: 3, blurb: "one square any way. slow, frugal, forgiving." },
  n: { price: 400, name: "Airbus Helicopter", glyph: "♞", fuel: 14, hull: 3, blurb: "hops over mountains. 2 fuel a jump." },
  b: { price: 500, name: "Citation Jet", glyph: "♝", fuel: 13, hull: 3, blurb: "long diagonals only, so plan the zigzag." },
  r: { price: 600, name: "Boeing 737", glyph: "♜", fuel: 18, hull: 5, blurb: "straight lines, tough airframe." },
  q: { price: 1200, name: "Airbus A380", glyph: "♛", fuel: 11, hull: 6, blurb: "goes anywhere, burns fuel like it's free." },
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

// ---- contracts ----------------------------------------------------------------
const ac = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Fewest turns between two squares ignoring fuel and storms, or null.
export function minTurns(type, from, to, mountains) {
  const seen = new Set([key(from.x, from.y)]);
  let frontier = [from], n = 0;
  while (frontier.length) {
    n++;
    const next = [];
    for (const c of frontier) for (const m of movesFrom(type, c.x, c.y, mountains)) {
      const k = key(m.x, m.y);
      if (seen.has(k)) continue;
      if (m.x === to.x && m.y === to.y) return n;
      seen.add(k); next.push(m);
    }
    frontier = next;
  }
  return null;
}

// A map and a route from (seed, spec). Never looks at the aircraft, so all craft see the same contract;
// it only needs to be flyable by the free Cessna on a stock tank.
export function genPlan(seed, spec) {
  const weather = WEATHER[spec.weather] ? spec.weather : "clear";
  for (let attempt = 0; attempt < 500; attempt++) {
    const r = rng(seed * 31 + attempt * 7919);
    const taken = new Set();
    const free = () => { for (let n = 0; n < 500; n++) { const x = Math.floor(r() * SIZE), y = Math.floor(r() * SIZE); if (!taken.has(key(x, y))) { taken.add(key(x, y)); return { x, y }; } } return null; };
    const nAir = Math.min(AIRPORTS.length, spec.legs + 2);
    const airports = [];
    for (let guard = 0; airports.length < nAir && guard < 400; guard++) {
      const p = free();
      if (!p) break;
      if (airports.every((a) => ac(a, p) >= 3)) airports.push({ ...p, name: AIRPORTS[airports.length] });
      else taken.delete(key(p.x, p.y));
    }
    if (airports.length < nAir) continue;
    const stops = []; let cur = 0;
    for (let i = 0; i < spec.legs; i++) {
      let nx; do { nx = Math.floor(r() * airports.length); } while (nx === cur);
      stops.push(nx); cur = nx;
    }
    const mountains = new Set();
    for (let i = 0; i < 7; i++) { const m = free(); if (m) mountains.add(key(m.x, m.y)); }
    const pads = []; { const p = free(); if (p) pads.push(p); }
    const storms = [];
    for (let i = 0; i < WEATHER[weather].storms; i++) {
      const p = free();
      if (p) storms.push({ ...p, dx: r() < 0.5 ? 1 : -1, dy: r() < 0.5 ? 1 : 0 });
    }
    let from = airports[0], ok = true;
    for (const si of stops) { if (!reachable("p", from, airports[si], mountains, LOAN_FUEL)) { ok = false; break; } from = airports[si]; }
    if (!ok) continue;
    return { seed, weather, cargo: spec.cargo, legs: spec.legs, airports, stops, mountains, pads, storms };
  }
  throw new Error("no flyable contract");
}

export function planLegs(plan) {
  const out = []; let from = plan.airports[0];
  for (const si of plan.stops) { out.push({ from, to: plan.airports[si] }); from = plan.airports[si]; }
  return out;
}
// Can this aircraft (with this much fuel) fly every leg of the plan?
export function canFly(plan, type, fuel) {
  return planLegs(plan).every((l) => reachable(type, l.from, l.to, plan.mountains, fuel));
}
export function contractPay(plan) {
  const d = planLegs(plan).reduce((sum, l) => sum + 80 + 15 * ac(l.from, l.to), 0);
  return Math.round((d * CARGO[plan.cargo].pay * WEATHER[plan.weather].pay) / 5) * 5;
}
// Turn limit for rush cargo, given the aircraft: its fastest route plus a little slack.
export function deadlineFor(plan, type) {
  const rush = CARGO[plan.cargo].rush;
  if (!rush) return null;
  let n = 0;
  for (const l of planLegs(plan)) { const m = minTurns(type, l.from, l.to, plan.mountains); if (m === null) return null; n += m; }
  return n + rush;
}

// ---- the career ----------------------------------------------------------------
export function newCareer(seed = 1) {
  return { seed, cash: START_CASH, flights: 0, rerolls: 0, rep: 0, fleet: { p: true }, upgrades: { tank: 0, plating: 0, radar: 0 }, won: false, crashes: 0, offers: null, history: [] };
}
export function makeOffers(c) {
  const out = [];
  const cargos = Object.keys(CARGO);
  for (let i = 0; i < 3; i++) {
    const r = rng(c.seed * 131 + c.flights * 17 + i * 101 + c.rerolls * 997);
    const legs = 1 + (c.flights >= 1 && r() < 0.5 ? 1 : 0) + (c.flights >= 4 && r() < 0.4 ? 1 : 0);
    const wr = r();
    const weather = c.flights < 1 ? (wr < 0.8 ? "clear" : "fog") : wr < 0.35 ? "clear" : wr < 0.6 ? "stormy" : wr < 0.8 ? "fog" : "gale";
    const cargo = cargos[Math.floor(r() * cargos.length)];
    const plan = genPlan(c.seed * 977 + c.flights * 53 + i * 211 + c.rerolls * 17, { legs, weather, cargo });
    out.push({ id: i, plan, pay: contractPay(plan) });
  }
  c.offers = out;
  return out;
}
export const reroll = (c) => { if (c.cash < REROLL_COST) return false; c.cash -= REROLL_COST; c.rerolls++; makeOffers(c); return true; };
export const maxFuelFor = (c, type) => CRAFT[type].fuel + 2 * c.upgrades.tank;
export const maxHullFor = (c, type) => CRAFT[type].hull + c.upgrades.plating;
export function buyUpgrade(c, id) {
  const u = UPGRADES[id], lvl = c.upgrades[id];
  if (lvl >= u.max || c.cash < u.price[lvl]) return false;
  c.cash -= u.price[lvl]; c.upgrades[id]++; return true;
}
export function buyCraft(c, type) {
  if (c.fleet[type] || c.cash < CRAFT[type].price) return false;
  c.cash -= CRAFT[type].price; c.fleet[type] = true; return true;
}
// Can this owned aircraft take the offer? Returns a reason string when it can't.
export function whyNot(c, offer, type) {
  if (!c.fleet[type]) return "not owned";
  if (!canFly(offer.plan, type, maxFuelFor(c, type))) return type === "b" ? "bishops can't reach that colour, or it's out of range" : "out of range with a clear route";
  if (CARGO[offer.plan.cargo].rush && deadlineFor(offer.plan, type) === null) return "can't make the deadline";
  return null;
}

export function planState(c, plan, type) {
  const start = plan.airports[0];
  const maxFuel = maxFuelFor(c, type), maxHull = maxHullFor(c, type);
  const cg = CARGO[plan.cargo];
  return {
    type, seed: plan.seed, pos: { x: start.x, y: start.y }, airports: plan.airports, stops: plan.stops, leg: 0,
    dest: { x: plan.airports[plan.stops[0]].x, y: plan.airports[plan.stops[0]].y },
    mountains: new Set(plan.mountains), pads: plan.pads.map((p) => ({ ...p })), storms: plan.storms.map((t) => ({ ...t })),
    stormSpeed: WEATHER[plan.weather].speed, weather: plan.weather, fogRadius: plan.weather === "fog" ? 2 + c.upgrades.radar : Infinity,
    forecast: 1 + (c.upgrades.radar > 0 ? 1 : 0),
    cargo: plan.cargo, pay: contractPay(plan), deadline: cg.rush ? deadlineFor(plan, type) : null,
    fuel: maxFuel, maxFuel, hull: maxHull, maxHull, hullLost: 0, turn: 0, status: "playing",
    cash: c.cash, bill: 0, bonus: 0, emergency: null, emergencyChance: EMERGENCY_CHANCE, rs: plan.seed * 7 + 13, career: true, result: null,
    log: [`${CRAFT[type].name} loaded with ${cg.name}. ${plan.stops.length} leg${plan.stops.length === 1 ? "" : "s"}; first stop ${plan.airports[plan.stops[0]].name}.`],
  };
}
export function startContract(c, offer, type) {
  if (whyNot(c, offer, type)) return null;
  return planState(c, offer.plan, type);
}

// Bank (or write off) a finished flight into the career.
export function finishFlight(c, s) {
  if (s.status === "won") {
    const net = s.result.pay - s.bill;
    c.cash = Math.max(0, c.cash + net);
    c.flights++; c.rep += { S: 3, A: 2, B: 1 }[s.result.rating]; c.history.push(s.result.rating);
    if (c.cash >= GOAL) c.won = true;
    c.offers = null;
    return { net };
  }
  if (s.status === "lost") {
    c.cash = Math.max(0, c.cash - s.bill);
    c.crashes++; c.flights++; c.history.push("X");
    let refund = 0;
    if (s.type !== "p") { refund = Math.round(CRAFT[s.type].price * 0.4); c.cash += refund; delete c.fleet[s.type]; }
    c.offers = null;
    return { net: refund - s.bill, refund };
  }
  return null;
}
// Walking away mid-flight: the aircraft is fine but the client is not.
export function abortFlight(c, s) {
  c.cash = Math.max(0, c.cash - ABORT_FEE - s.bill);
  c.flights++; c.history.push("-"); c.offers = null;
}

function settle(s) {
  const cg = CARGO[s.cargo];
  let pay = s.pay - cg.penalty * s.hullLost;
  const late = s.deadline !== null && s.turn > s.deadline;
  if (late) pay = cg.strict ? 0 : Math.round(pay / 2);
  pay = Math.max(0, pay + s.bonus);
  const rating = !late && s.hullLost === 0 ? "S" : !late && s.hullLost <= 1 ? "A" : "B";
  s.result = { pay, rating, late };
  s.log.push(`delivered. ${late ? "late. " : ""}paid $${pay}${s.bill ? `, fuel bill $${s.bill}` : ""}. rating ${rating}.`);
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
    return { type, seed, pos: { ...start }, dest, mountains, pads, storms, fuel: craft.fuel, maxFuel: craft.fuel, hull: craft.hull, turn: 0, status: "playing", stormSpeed: 1, fogRadius: Infinity, forecast: 1, airports: [{ ...start, name: "HOME" }, { ...dest, name: "AIRPORT" }], stops: [1], leg: 0, emergency: null, emergencyChance: 0, hullLost: 0, maxHull: craft.hull, rs: seed + 5, bill: 0, bonus: 0, cash: 0, deadline: null, log: [`${craft.name} cleared for takeoff. destination: top-right airport.`] };
  }
  throw new Error("no flyable map");
}

export const stormSet = (s) => new Set(s.storms.map((t) => key(t.x, t.y)));
// Where the cells will be after `turns` more turns (they move deterministically, bouncing off the edges).
export const nextStormSet = (s, turns = 1) => new Set(s.storms.map((t) => {
  let n = t;
  for (let i = 0; i < (s.stormSpeed || 1) * turns; i++) n = stormStep(n);
  return key(n.x, n.y);
}));
export const legalMoves = (s) => movesFrom(s.type, s.pos.x, s.pos.y, s.mountains).filter((m) => m.cost <= s.fuel);
export const airportAt = (s, x, y) => (s.airports || []).find((a) => a.x === x && a.y === y) || null;
export const visible = (s, x, y) => Math.max(Math.abs(x - s.pos.x), Math.abs(y - s.pos.y)) <= s.fogRadius;

function roll(s) {
  s.rs = (s.rs + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Apply a move to (x,y). Returns false for an illegal one.
export function fly(s, x, y) {
  if (s.status !== "playing") return false;
  const m = legalMoves(s).find((v) => v.x === x && v.y === y);
  if (!m) return false;
  s.turn++; s.fuel -= m.cost; s.pos = { x, y };
  const ap = airportAt(s, x, y);
  if (x === s.dest.x && y === s.dest.y) {
    if (s.leg + 1 >= s.stops.length) {
      s.status = "won"; s.leg++;
      s.log.push(`touchdown! landed with ${s.fuel} fuel and ${s.hull} hull left.`);
      if (s.career) settle(s);
      return true;
    }
    s.leg++;
    const nx = s.airports[s.stops[s.leg]];
    s.dest = { x: nx.x, y: nx.y };
    s.log.push(`${ap.name}: leg ${s.leg} done. next stop ${nx.name}.`);
  }
  if (ap) {
    if (s.emergency) { s.emergency = null; s.bonus += 40; s.log.push(`emergency landing at ${ap.name}: crisis over. +$40 for keeping your head.`); }
    if (s.fuel < s.maxFuel) {
      // refuelling costs money in a career; a quick hop is free
      const want = s.maxFuel - s.fuel;
      const afford = s.career ? Math.min(want, Math.floor(Math.max(0, s.cash - s.bill) / REFUEL_COST)) : want;
      if (afford > 0) { s.fuel += afford; if (s.career) s.bill += afford * REFUEL_COST; s.log.push(`${ap.name}: refuelled${s.career ? ` ($${afford * REFUEL_COST})` : ""}.`); }
      else if (s.career) s.log.push(`${ap.name}: you can't afford fuel.`);
    }
  } else if (s.pads.some((p) => p.x === x && p.y === y) && s.fuel < s.maxFuel) { s.fuel = s.maxFuel; s.log.push("refuelled at a fuel pad."); }
  for (let i = 0; i < (s.stormSpeed || 1); i++) s.storms = s.storms.map(stormStep);
  if (!ap && stormSet(s).has(key(x, y))) {
    s.hull -= STORM_HULL; s.hullLost++; s.fuel = Math.max(0, s.fuel - STORM_FUEL);
    s.log.push(`a storm rolls over you: hull −${STORM_HULL}, fuel −${STORM_FUEL}.`);
  }
  // emergencies: engine fire (land within 4 turns or lose 2 hull) and fuel leak (1 fuel a turn)
  if (s.emergency) {
    if (s.emergency.kind === "leak") { s.fuel = Math.max(0, s.fuel - 1); }
    else if (--s.emergency.timer <= 0) { s.hull -= 2; s.hullLost += 2; s.emergency = null; s.log.push("the fire burns through the wiring: hull −2."); }
  } else if (!ap && s.turn >= 3 && roll(s) < s.emergencyChance) {
    if (roll(s) < 0.5) { s.emergency = { kind: "fire", timer: 4 }; s.log.push("MAYDAY: engine fire! land at any airport within 4 turns."); }
    else { s.emergency = { kind: "leak", timer: 0 }; s.log.push("MAYDAY: fuel leak! you lose 1 fuel every turn until you land at an airport."); }
  }
  if (s.hull <= 0) { s.status = "lost"; s.log.push("the airframe gave out. crash."); }
  else if (legalMoves(s).length === 0) { s.status = "lost"; s.log.push("out of fuel with nowhere to glide. crash."); }
  return true;
}

export const score = (s) => s.status === "won" ? s.fuel * 10 + s.hull * 25 : 0;

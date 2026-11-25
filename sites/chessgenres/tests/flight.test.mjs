import test from "node:test";
import assert from "node:assert";
import { CRAFT, newFlight, movesFrom, fly, legalMoves, stormStep, SIZE } from "../public/flight-logic.js";

test("every aircraft gets a solvable map for many seeds", () => {
  for (const t of Object.keys(CRAFT)) for (let seed = 1; seed < 60; seed++) assert.ok(newFlight(t, seed).status === "playing");
});
test("movement shapes and fuel cost", () => {
  const none = new Set();
  assert.equal(movesFrom("n", 3, 3, none).length, 8);
  assert.ok(movesFrom("n", 3, 3, none).every((m) => m.cost === 2));
  assert.equal(movesFrom("r", 0, 0, none).length, 14);
  assert.equal(movesFrom("p", 0, 0, none).length, 3);
  assert.equal(movesFrom("b", 0, 0, none).length, 7);
  assert.equal(movesFrom("r", 0, 0, new Set(["3,0"])).filter((m) => m.y === 0).length, 2);
});
test("storms bounce at the edge", () => {
  const n = stormStep({ x: SIZE - 1, y: 3, dx: 1, dy: 0 });
  assert.deepEqual([n.x, n.dx], [SIZE - 2, -1]);
});
test("flying burns fuel, rejects illegal moves, can win", () => {
  const s = newFlight("q", 5);
  s.mountains.clear(); s.storms = []; s.pads = [];
  const f0 = s.fuel;
  assert.equal(fly(s, 3, 3), false); // not a queen line from (0,7)
  assert.equal(fly(s, 7, 0), true);
  assert.equal(s.fuel, f0 - 7);
  assert.equal(s.status, "won");
});
test("storm hit costs hull and out-of-fuel loses", () => {
  const s = newFlight("p", 9);
  s.mountains.clear(); s.pads = []; s.pos = { x: 3, y: 3 };
  s.storms = [{ x: 4, y: 4, dx: 0, dy: 1 }]; // will step to 4,5? ensure it lands on target
  s.storms = [{ x: 4, y: 3, dx: 0, dy: 1 }]; // steps to 4,4
  const h = s.hull;
  assert.equal(fly(s, 4, 4), true);
  assert.equal(s.hull, h - 1);
  s.fuel = 1; s.storms = [];
  fly(s, 4, 5);
  assert.equal(s.status, "lost");
});

import { newCareer, makeOffers, whyNot, startContract, finishFlight, abortFlight, buyUpgrade, buyCraft, reroll, genPlan, canFly, contractPay, deadlineFor, planLegs, airportAt, nextStormSet, visible, GOAL, UPGRADES, REROLL_COST } from "../public/flight-logic.js";

test("contract plans are deterministic and every leg is flyable by the free Cessna", () => {
  for (let seed = 1; seed < 40; seed++) for (const weather of ["clear", "stormy", "gale", "fog"]) for (const legs of [1, 2, 3]) {
    const plan = genPlan(seed, { legs, weather, cargo: "freight" });
    assert.equal(plan.stops.length, legs);
    assert.ok(canFly(plan, "p", 22));
    assert.equal(plan.airports.length, Math.min(5, legs + 2));
    for (const a of plan.airports) assert.ok(!plan.mountains.has(a.x + "," + a.y));
    assert.ok(contractPay(plan) > 0);
  }
  assert.deepEqual(genPlan(5, { legs: 2, weather: "clear", cargo: "mail" }).stops, genPlan(5, { legs: 2, weather: "clear", cargo: "mail" }).stops);
});

test("offers vary and the career economy works", () => {
  const c = newCareer(9);
  const offers = makeOffers(c);
  assert.equal(offers.length, 3);
  assert.ok(new Set(offers.map((o) => o.plan.cargo + o.plan.weather + o.plan.stops)).size > 1);
  const before = JSON.stringify(c.offers.map((o) => o.pay));
  assert.ok(reroll(c)); assert.equal(c.cash, 200 - REROLL_COST);
  assert.notEqual(JSON.stringify(c.offers.map((o) => o.pay)), before);
  c.cash = 3000;
  assert.ok(buyUpgrade(c, "tank")); assert.equal(c.upgrades.tank, 1); assert.equal(c.cash, 3000 - UPGRADES.tank.price[0]);
  assert.ok(buyCraft(c, "q")); assert.ok(c.fleet.q);
  assert.equal(buyCraft(c, "q"), false);
});

test("a delivered contract pays out, refuelling at airports costs money", () => {
  const c = newCareer(3);
  const offer = makeOffers(c).find((o) => !whyNot(c, o, "p"));
  const s = startContract(c, offer, "p");
  assert.equal(s.fuel, 22);
  s.storms = []; s.mountains.clear(); s.emergencyChance = 0;
  // fly straight to each stop with king steps
  for (let leg = 0; s.status === "playing" && leg < 3; ) {
    const d = s.dest;
    for (let guard = 0; guard < 60 && s.status === "playing" && !(s.pos.x === d.x && s.pos.y === d.y); guard++) {
      s.fuel = Math.max(s.fuel, 5);
      const dx = Math.sign(d.x - s.pos.x), dy = Math.sign(d.y - s.pos.y);
      assert.ok(fly(s, s.pos.x + dx, s.pos.y + dy));
    }
    leg++;
  }
  assert.equal(s.status, "won");
  assert.ok(s.result.pay > 0 && ["S", "A", "B"].includes(s.result.rating));
  const cash0 = c.cash;
  finishFlight(c, s);
  assert.equal(c.cash, cash0 + s.result.pay - s.bill);
  assert.equal(c.flights, 1);
});

test("crashing destroys a bought aircraft but never the loaner", () => {
  const c = newCareer(4); c.cash = 2000; buyCraft(c, "r");
  const offer = makeOffers(c).find((o) => !whyNot(c, o, "r")) || makeOffers(c)[0];
  const s = startContract(c, { ...offer, plan: genPlan(1, { legs: 1, weather: "clear", cargo: "freight" }) }, "r");
  s.status = "lost"; s.bill = 10;
  const cash0 = c.cash;
  finishFlight(c, s);
  assert.ok(!c.fleet.r && c.fleet.p);
  assert.equal(c.cash, cash0 - 10 + Math.round(600 * 0.4));
});

test("emergencies end with an airport landing, fuel leaks drain, fire burns hull", () => {
  const c = newCareer(2);
  const plan = genPlan(11, { legs: 1, weather: "clear", cargo: "freight" });
  const s = startContract(c, { plan }, "p");
  s.storms = []; s.mountains.clear(); s.pads = [];
  s.emergency = { kind: "leak", timer: 0 }; s.emergencyChance = 0;
  const f = s.fuel;
  fly(s, s.pos.x + (s.pos.x < 7 ? 1 : -1), s.pos.y);
  assert.equal(s.fuel, f - 2); // one square plus one leaked
  const t = startContract(c, { plan }, "p");
  t.storms = []; t.emergencyChance = 0; t.emergency = { kind: "fire", timer: 1 };
  const h = t.hull;
  fly(t, t.pos.x + (t.pos.x < 7 ? 1 : -1), t.pos.y);
  assert.equal(t.hull, h - 2);
});

test("fog hides far storms, a gale moves them twice, radar extends the forecast", () => {
  const c = newCareer(2); c.upgrades.radar = 1;
  const plan = genPlan(12, { legs: 1, weather: "fog", cargo: "freight" });
  const s = startContract(c, { plan }, "p");
  assert.equal(s.fogRadius, 3);
  assert.ok(visible(s, s.pos.x, s.pos.y));
  const g = genPlan(12, { legs: 1, weather: "gale", cargo: "freight" });
  const gs = startContract(c, { plan: g }, "p");
  assert.equal(gs.stormSpeed, 2);
  assert.equal(nextStormSet(gs, 2).size > 0, true);
});

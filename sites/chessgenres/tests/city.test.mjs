import test from "node:test";
import assert from "node:assert";
import { N, GOAL, reach, newCity, place, bulldoze, tick, totalPop, analyze, houseCap } from "../public/city-logic.js";

const at = (r, c) => r * N + c;

test("reach sets", () => {
  assert.equal(reach("knight", 5, 5).length, 8);
  assert.equal(reach("rook", 5, 5).length, 2 * (N - 1));
  assert.equal(reach("pawn", 5, 5).length, 0);
});
test("unpowered houses stay empty, powered ones grow", () => {
  const c = newCity();
  place(c, "pawn", at(0, 0));
  tick(c, () => 0.99);
  assert.equal(totalPop(c), 0);
  place(c, "queen", at(0, 5)); // same rank as the house
  tick(c, () => 0.99);
  assert.equal(c.cells[at(0, 0)].pop, 3);
});
test("parks raise the cap, factories lower it", () => {
  const c = newCity();
  c.money = 9999;
  place(c, "pawn", at(2, 2)); place(c, "queen", at(2, 8));
  const base = houseCap(analyze(c)[at(2, 2)]);
  place(c, "bishop", at(0, 0)); // diagonal through (2,2)
  assert.ok(houseCap(analyze(c)[at(2, 2)]) > base);
  place(c, "rook", at(2, 5)); place(c, "rook", at(5, 2));
  assert.ok(houseCap(analyze(c)[at(2, 2)]) < base + 10);
});
test("can't build on occupied or unaffordable squares; bulldoze works", () => {
  const c = newCity();
  assert.ok(place(c, "pawn", 0));
  assert.ok(!place(c, "pawn", 0));
  c.money = 0;
  assert.ok(!place(c, "pawn", 1));
  assert.ok(bulldoze(c, 0));
  assert.ok(!bulldoze(c, 0));
});
test("rampage fires on schedule and bankruptcy ends the game", () => {
  const c = newCity();
  c.month = 17;
  const ev = tick(c, () => 0.1);
  assert.equal(ev.length, 1);
  c.money = -1000;
  tick(c);
  assert.equal(c.status, "lost");
});
test("goal is reachable with a simple grid plan", () => {
  const c = newCity();
  c.money = 1e6;
  for (const col of [1, 4, 7, 10]) place(c, "queen", at(0, col));
  for (let r = 1; r < N; r++) for (let col = 0; col < N; col++) {
    if (r % 3 === 0) place(c, "bishop", at(r, col)); else place(c, "pawn", at(r, col));
  }
  let m = 0;
  while (c.status === "playing" && m++ < 400) tick(c, () => 0.99);
  assert.equal(c.status, "won", `pop ${totalPop(c)} of ${GOAL}`);
});

import { makeTerrain, newOmen, omenSquares, omenName, newContract, contractDone, cityScore, TAX } from "../public/city-logic.js";

test("terrain is seeded; lakes block building and ore boosts factories", () => {
  assert.ok(makeTerrain(0).every((t) => t === 0));
  assert.deepEqual(makeTerrain(7), makeTerrain(7));
  const t = makeTerrain(7);
  assert.ok(t.includes(1) && t.includes(2));
  const c = newCity(7);
  const lake = c.terrain.indexOf(1), ore = c.terrain.indexOf(2);
  assert.ok(!place(c, "pawn", lake));
  c.money = 5000;
  place(c, "rook", ore);
  const m = c.money; tick(c, () => 0.99);
  assert.equal(c.money - m, 30 + 40);
});
test("lakeside houses are happier", () => {
  const c = newCity(0);
  c.terrain[at(5, 5)] = 1;
  place(c, "pawn", at(5, 6)); place(c, "pawn", at(9, 9)); place(c, "queen", at(5, 11)); place(c, "queen", at(9, 0));
  const inf = analyze(c);
  assert.ok(houseCap(inf[at(5, 6)]) > houseCap(inf[at(9, 9)]));
});
test("disasters are announced a month ahead and fire stations shield", () => {
  const c = newCity(0);
  c.money = 9999;
  c.month = 16;
  const ev = tick(c, () => 0.1); // month 17: omen
  assert.ok(c.omen && /omen/.test(ev[0]));
  const o = { kind: "queen", row: true, k: 4 };
  c.omen = o;
  place(c, "pawn", at(4, 3)); place(c, "pawn", at(4, 9)); place(c, "king", at(4, 8));
  const ev2 = tick(c, () => 0.1); // month 18: strike, every unshielded building dies at rng 0.1
  assert.equal(c.omen, null);
  assert.ok(c.cells[at(4, 9)], "neighbour of the fire station survives");
  assert.ok(c.cells[at(4, 8)], "the station itself survives");
  assert.ok(!c.cells[at(4, 3)]);
  assert.equal(c.lastLost.length, 1);
  assert.match(ev2.join(" "), /saved/);
});
test("omen squares cover rank, diagonal and knight shapes", () => {
  assert.equal(omenSquares({ kind: "queen", row: false, k: 3 }).length, N);
  assert.equal(omenSquares({ kind: "bishop", anti: false, k: N - 1 }).length, N);
  assert.equal(omenSquares({ kind: "bishop", anti: true, k: N - 1 }).length, N);
  assert.equal(omenSquares({ kind: "knight", r: 5, c: 5 }).length, 9);
  for (let s = 0; s < 5; s++) assert.ok(omenName(newOmen(() => Math.random())));
});
test("contracts pay out once, taxes trade income for room, score rewards speed", () => {
  const c = newCity(0);
  c.money = 5000; c.month = 5;
  tick(c, () => 0.99);
  assert.ok(c.contract);
  c.contract = { id: "parks", type: "bishop", text: "x", need: 1, pay: 100, due: 99 };
  place(c, "bishop", at(0, 0));
  const m = c.money; tick(c, () => 0.99);
  assert.ok(c.money > m + 90 && c.done === 1);
  assert.ok(TAX[2].income > TAX[0].income && TAX[2].cap < TAX[0].cap);
  const d = newContract(c, () => 0.5);
  assert.equal(contractDone(c, d), false);
  const fast = { ...c, status: "won", month: 100 }, slow = { ...c, status: "won", month: 300 };
  assert.ok(cityScore(fast) > cityScore(slow));
});

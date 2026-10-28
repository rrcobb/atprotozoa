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

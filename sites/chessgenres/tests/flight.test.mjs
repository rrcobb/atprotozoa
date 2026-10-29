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

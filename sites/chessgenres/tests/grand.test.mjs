import { test } from "node:test";
import assert from "node:assert";
import { newGame, myMoves, move, genMoves, wait, GOAL } from "../public/grand-logic.js";

test("on foot moves like a king and not into buildings", () => {
  const s = newGame(1);
  const ms = myMoves(s);
  assert.ok(ms.length > 0 && ms.every((m) => Math.max(Math.abs(m.x - 0), Math.abs(m.y - 9)) === 1));
  s.me = { x: 0, y: 0, ride: "k" };
  assert.ok(!myMoves(s).some((m) => m.x === 1 && m.y === 1));
});

test("carjacking swaps rides and raises wanted", () => {
  const s = newGame(1);
  s.me = { x: 2, y: 4, ride: "k" }; s.civs = []; s.cars = [{ x: 3, y: 3, t: "n" }];
  assert.ok(move(s, 3, 3));
  assert.strictEqual(s.me.ride, "n");
  assert.strictEqual(s.wanted, 1);
  assert.strictEqual(s.cars.length, 0);
});

test("sliders are blocked by bodies", () => {
  const s = newGame(1);
  s.civs = [{ x: 0, y: 5 }]; s.cars = []; s.cops = [];
  s.me = { x: 0, y: 9, ride: "r" };
  const ys = myMoves(s).filter((m) => m.x === 0).map((m) => m.y);
  assert.ok(ys.includes(5) && !ys.includes(4));
});

test("cash wins the run", () => {
  const s = newGame(1);
  s.cash = GOAL - 100; s.cash_at = [{ x: 1, y: 9 }]; s.civs = [];
  move(s, 1, 9);
  assert.strictEqual(s.status, "won");
});

test("cops capture you with real moves, and spray clears them", () => {
  const s = newGame(1);
  s.civs = []; s.wanted = 1; s.me = { x: 3, y: 3, ride: "k" };
  s.cops = [{ x: 3, y: 0, t: "r" }];
  wait(s);
  assert.strictEqual(s.status, "lost");
  const t = newGame(1);
  t.civs = []; t.wanted = 2; t.cops = [{ x: 0, y: 0, t: "n" }]; t.me = { x: 8, y: 9, ride: "k" };
  move(t, 9, 9);
  assert.strictEqual(t.wanted, 0); assert.strictEqual(t.cops.length, 0);
});

test("knight moves", () => {
  const ms = genMoves("n", 4, 4, () => false, () => true);
  assert.ok(ms.length > 0 && ms.every((m) => Math.abs(m.x - 4) * Math.abs(m.y - 4) === 2));
});

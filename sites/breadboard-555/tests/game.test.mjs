import test from "node:test";
import assert from "node:assert/strict";
import { newGame, place, move, pass, rematch } from "../public/lib/game.js";

const find = (g, seat, pred) => g.stacks[seat].find(pred);
test("turns alternate and wrong seat is refused", () => {
  const g = newGame("a");
  const w = find(g, 1, (p) => p.kind === "wire");
  assert.equal(place(g, 1, w.id, "P8", "VCC"), false);
  const w0 = find(g, 0, (p) => p.kind === "wire");
  assert.equal(place(g, 0, w0.id, "P8", "VCC"), true);
  assert.equal(g.turn, 1);
  assert.equal(g.placed.length, 1);
});
test("a player can only place from their own stack", () => {
  const g = newGame("a");
  const theirs = find(g, 1, (p) => p.kind === "wire");
  assert.equal(place(g, 0, theirs.id, "P8", "VCC"), false);
});
test("either player can move any part on the shared board", () => {
  const g = newGame("a");
  const w0 = find(g, 0, (p) => p.kind === "wire");
  place(g, 0, w0.id, "P8", "VCC");
  assert.equal(move(g, 1, w0.id, "P8", "GND"), true);
  assert.deepEqual([g.placed[0].a, g.placed[0].b, g.placed[0].by], ["P8", "GND", 0]);
});
test("shared board: the player who completes the circuit wins", () => {
  const g = newGame("a");
  const plan = [
    [0, (p) => p.kind === "wire", "P8", "VCC"], [1, (p) => p.kind === "led", "P1", "P2"],
    [0, (p) => p.kind === "wire", "P1", "GND"], [1, (p) => p.kind === "diode", "P1", "P4"],
    [0, (p) => p.kind === "wire", "P4", "VCC"], [1, (p) => p.kind === "coil", "P1", "P5"],
    [0, (p) => p.kind === "wire", "P2", "P6"], [1, (p) => p.kind === "res" && p.ohms === 1e3, "P1", "P7"],
  ];
  for (const [s, pred, a, b] of plan) assert.ok(place(g, s, find(g, s, pred).id, a, b));
  assert.equal(g.winner, null);
  assert.ok(place(g, 0, find(g, 0, (p) => p.kind === "res" && p.ohms === 100e3).id, "P3", "P6"));
  assert.equal(g.winner, null);
  assert.ok(place(g, 1, find(g, 1, (p) => p.kind === "cap" && p.farads === 1e-6).id, "P6", "GND"));
  assert.equal(g.winner, 2);
  assert.equal(pass(g, 0), false);
});
test("shorting V+ to GND is smoke, not a win", () => {
  const g = newGame("a");
  place(g, 0, find(g, 0, (p) => p.kind === "wire").id, "VCC", "GND");
  assert.equal(g.winner, null);
  assert.match(g.log, /smoke/);
});
test("pass flips the turn; rematch resets the board", () => {
  const g = newGame("a");
  assert.equal(pass(g, 0), true);
  assert.equal(g.turn, 1);
  place(g, 1, find(g, 1, (p) => p.kind === "wire").id, "P8", "VCC");
  rematch(g);
  assert.equal(g.placed.length, 0);
  assert.equal(g.round, 1);
  assert.equal(g.winner, null);
});

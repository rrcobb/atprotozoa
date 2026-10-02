import test from "node:test";
import assert from "node:assert/strict";
import { chessify } from "../public/lib/chess.js";

test("swaps words and keeps the rest", () => {
  const r = chessify("AI Safety Can't Afford to Pick a Side on Consciousness");
  assert.equal(r.title, "Chess engine King safety Can't Afford to Play a Side on Board vision");
  assert.ok(!r.appended);
});

test("falls back to a chess tag, before trailing punctuation", () => {
  const r = chessify("Zxqv blorp?");
  assert.ok(r.appended);
  assert.match(r.title, /^Zxqv blorp \(.*\)\?$/);
  assert.equal(chessify("Zxqv blorp?").title, r.title);
});

test("long all-caps words stay shouted", () => {
  assert.equal(chessify("MISTAKES were made").title, "BLUNDERS were made");
});

import test from "node:test";
import assert from "node:assert/strict";
import { makeState, probs, measure, basisWords, MAX_BASIS } from "../public/lib/state.js";

test("state is a unit vector", () => {
  const st = makeState("quantum mechanics describes possible futures before observation");
  const sum = probs(st).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});
test("stopwords, links and dupes dropped; capped at MAX_BASIS", () => {
  const w = basisWords("the https://x.co quantum quantum alpha bravo charlie delta echo foxtrot golf hotel");
  assert.ok(!w.includes("the") && w.length === MAX_BASIS && new Set(w).size === w.length);
});
test("empty posts have no state", () => assert.equal(makeState("ok no the and"), null));
test("measure follows the cumulative distribution", () => {
  const st = makeState("alpha bravo charlie");
  const p = probs(st);
  assert.equal(measure(st, () => 0).index, 0);
  assert.equal(measure(st, () => 0.999999).index, p.length - 1);
});

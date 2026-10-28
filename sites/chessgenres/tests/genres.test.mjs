import test from "node:test";
import assert from "node:assert";
import { classify, score, newRun, startRound, play, discard, targetFor } from "../public/balatro-logic.js";
import { makeUnit, options, tick, result, mergeOnce, enemyTeam } from "../public/auto-logic.js";

const c = (t, col = "w", id = Math.random()) => ({ id, t, col });

test("balatro hand classification", () => {
  assert.equal(classify([c("q"), c("q")]).name, "pair");
  assert.equal(classify([c("n"), c("n"), c("p"), c("p"), c("p")]).name, "full house");
  assert.equal(classify([c("n"), c("b"), c("r"), c("q"), c("k")]).name, "royal back rank");
  assert.equal(classify([c("n"), c("b"), c("r"), c("q"), c("k", "b")]).name, "back rank");
  assert.equal(classify([c("p"), c("p"), c("p"), c("p"), c("p")]).name, "five pawns");
  assert.equal(classify([c("p"), c("n")]).name, "high card");
});
test("balatro scoring, jokers and debuff", () => {
  assert.equal(score([c("q"), c("q")]).total, (10 + 18) * 2);
  assert.equal(score([c("q"), c("q")], [], { debuff: "q" }).total, 10 * 2);
});
test("balatro round flow", () => {
  const run = newRun(() => 0.3); startRound(run);
  assert.equal(run.round.hand.length, 8);
  assert.ok(play(run, run.round.hand.slice(0, 2).map((x) => x.id)));
  assert.equal(run.round.hand.length, 8);
  assert.ok(discard(run, [run.round.hand[0].id]));
  assert.equal(run.round.discards, 2);
  assert.equal(play(run, []), null);
  assert.equal(targetFor(0, 2), 200);
});
test("autobattler movement blocks and captures", () => {
  const rook = makeUnit("r", 1, 0, 7, 0), foe = makeUnit("p", 1, 1, 3, 0), blocker = makeUnit("p", 1, 0, 5, 0);
  assert.equal(options(rook, [rook, foe]).hits.length, 1);
  assert.equal(options(rook, [rook, foe, blocker]).hits.length, 0);
});
test("autobattler battle ends and merge works", () => {
  const units = [makeUnit("q", 1, 0, 7, 3), makeUnit("p", 1, 1, 0, 3)];
  let t = 0, res = null;
  while (!res && t < 200) { tick(units); res = result(units, ++t); }
  assert.equal(res, "player");
  const ps = [{ type: "p", star: 1 }, { type: "p", star: 1 }, { type: "p", star: 1 }, { type: "n", star: 1 }];
  assert.ok(mergeOnce(ps));
  assert.equal(ps.length, 2);
  assert.equal(ps[0].star, 2);
  assert.ok(enemyTeam(10).some((u) => u.giant));
});

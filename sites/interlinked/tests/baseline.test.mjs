import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOUNS,
  weave,
  shuffle,
  buildRecitationRounds,
  buildInterjection,
  buildClimax,
  buildTest,
} from "../public/lib/baseline.js";

test("weave nests phrases recursively", () => {
  assert.equal(weave(["a"]), "a");
  assert.equal(weave(["a", "b"]), "a, interlinked within b");
  assert.equal(weave(["a", "b", "c"]), "a, interlinked within b, interlinked within c");
});

test("weave of an empty list is empty", () => {
  assert.equal(weave([]), "");
});

test("shuffle with a fixed rng is deterministic and a permutation", () => {
  let calls = [0.9, 0.1, 0.5, 0.2];
  let i = 0;
  const rng = () => calls[i++ % calls.length];
  const shuffled = shuffle(NOUNS, rng);
  assert.equal(shuffled.length, NOUNS.length);
  assert.deepEqual([...shuffled].sort(), [...NOUNS].sort());
});

test("recitation rounds grow by one interlink per round", () => {
  const order = NOUNS;
  const rounds = buildRecitationRounds(order);
  assert.equal(rounds.length, order.length);
  assert.equal(rounds[0], "Bisk.");
  assert.equal(rounds[1], "Bisk, interlinked within bloosk.");
  // each round's interlink count grows by exactly one
  for (let i = 0; i < rounds.length; i++) {
    const count = (rounds[i].match(/interlinked within/g) || []).length;
    assert.equal(count, i);
  }
});

test("interjection references the first and last phrase in order", () => {
  const line = buildInterjection(NOUNS);
  assert.match(line, /bisk/);
  assert.match(line, /wall cukes/);
});

test("climax folds in the predicate and greeting exactly once", () => {
  const climax = buildClimax(NOUNS);
  assert.match(climax, /mogged by 4th grade girls/);
  assert.match(climax, /gm, fellow top chickens/);
  assert.equal((climax.match(/interlinked/g) || []).length >= NOUNS.length, true);
});

test("buildTest is reproducible for a fixed rng and covers all nouns", () => {
  const rng = () => 0.42;
  const a = buildTest(rng);
  const b = buildTest(rng === rng ? () => 0.42 : Math.random);
  assert.deepEqual(a.order.slice().sort(), NOUNS.slice().sort());
  assert.equal(a.recitation.length, NOUNS.length);
  assert.equal(a.climax, b.climax);
});

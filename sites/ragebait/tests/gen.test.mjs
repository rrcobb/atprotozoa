import { test } from "node:test";
import assert from "node:assert";
import { makeCard, TOPICS, FRAMES } from "../public/gen.js";

test("every topic x heat x seeds yields a finished tweet", () => {
  for (const k of Object.keys(TOPICS)) for (const h of [1, 2, 3]) for (let s = 1; s < 60; s++) {
    const c = makeCard([k], h, s);
    assert.ok(c.text.length > 20 && !/[{}]|undefined/.test(c.text), c.text);
    assert.equal(c.topic, k);
    assert.equal(c.reps.length, 2);
  }
});
test("same seed, same card; no topics means any topic", () => {
  assert.deepEqual(makeCard([], 2, 7), makeCard([], 2, 7));
  assert.ok(makeCard(null, 9, 3).heat === 3);
});
test("every frame has a slot", () => { for (const f of FRAMES) assert.match(f.t, /\{[cC]\}/); });

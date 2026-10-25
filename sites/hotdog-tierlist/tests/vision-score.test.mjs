import test from "node:test";
import assert from "node:assert";
import { scoreImage, softmax } from "../public/lib/vision-score.js";

const e = (i) => Array.from({ length: 4 }, (_, k) => (k === i ? 1 : 0));
const text = { gate: [e(0), e(1), e(2)], baseline: e(3), toppings: { mustard: [1, 0, 0, 0.5] } };

test("softmax sums to 1", () => {
  assert.ok(Math.abs(softmax([1, 2, 3]).reduce((a, b) => a + b) - 1) < 1e-9);
});
test("non-hotdog image yields no toppings", () => {
  const r = scoreImage(e(1), text);
  assert.ok(r.hotdog < 0.5);
  assert.deepStrictEqual(r.toppings, []);
});
test("hotdog image close to a topping caption reports it", () => {
  const r = scoreImage([1, 0, 0, 0], text);
  assert.ok(r.hotdog > 0.5);
  assert.deepStrictEqual(r.toppings.map((t) => t.name), ["mustard"]);
});

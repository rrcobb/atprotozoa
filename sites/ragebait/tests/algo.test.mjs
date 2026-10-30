import { test } from "node:test";
import assert from "node:assert";
import { freshModel, applyLike, pickTopic, pickHeat, FLOOR } from "../public/algo.js";
import { rng } from "../public/gen.js";

const keys = ["a", "b", "c", "d"];
test("liking a topic makes it dominate the draw", () => {
  let m = freshModel(keys);
  for (let i = 0; i < 4; i++) m = applyLike(m, "b", 3);
  const r = rng(5); const n = { a: 0, b: 0, c: 0, d: 0 };
  for (let i = 0; i < 4000; i++) n[pickTopic(m, r)]++;
  assert.ok(n.b > 2500, JSON.stringify(n));
  assert.ok(n.a > 0 && n.c > 0, "others still appear");
});
test("unlike reverses, floor holds, heat follows likes", () => {
  let m = freshModel(keys);
  m = applyLike(m, "a", 3); m = applyLike(m, "a", 3, false);
  assert.ok(Math.abs(m.w.a - 1) < 1e-9 && m.likes === 0);
  for (let i = 0; i < 50; i++) m = applyLike(m, "a", 3, false);
  assert.ok(m.w.a >= FLOOR);
  let h = freshModel(keys); for (let i = 0; i < 10; i++) h = applyLike(h, "c", 3);
  assert.equal(Math.round(h.heat), 3);
  const r = rng(1); for (let i = 0; i < 200; i++) { const v = pickHeat(h, r); assert.ok(v >= 1 && v <= 3); }
});

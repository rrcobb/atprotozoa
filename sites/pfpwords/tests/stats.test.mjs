import test from "node:test";
import assert from "node:assert";
import { tokens, newCounts, addProfile, rank, classify } from "../public/lib/stats.js";

test("tokens dedupes, drops stopwords and urls", () => {
  const t = tokens("Cat cat CAT mom 🐱 the https://x.com/foo she's");
  assert.deepStrictEqual(t.sort(), ["cat", "mom", "🐱"].sort());
});

test("rank splits by lean", () => {
  const c = newCounts();
  for (let i = 0; i < 10; i++) addProfile(c, "cat", "purr mom");
  for (let i = 0; i < 10; i++) addProfile(c, "anime", "weeb mom");
  const r = rank(c);
  assert.strictEqual(r.cat[0].word, "purr");
  assert.strictEqual(r.anime[0].word, "weeb");
  assert.ok(![...r.cat, ...r.anime].some((x) => x.word === "mom" && Math.abs(x.lo) > 0.1));
});

test("classify picks the closer text embedding", () => {
  const p = classify([1, 0], [[1, 0.1], [0, 1]]);
  assert.ok(p[0] > 0.9);
});

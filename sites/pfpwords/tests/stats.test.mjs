import test from "node:test";
import assert from "node:assert";
import { tokens, newCounts, addPost, rank, classify } from "../public/lib/stats.js";

test("tokens dedupes, drops stopwords and urls", () => {
  const t = tokens("Cat cat CAT mom 🐱 the https://x.com/foo she's");
  assert.deepStrictEqual(t.sort(), ["cat", "mom", "🐱"].sort());
});

test("rank splits by lean", () => {
  const c = newCounts();
  for (let i = 0; i < 10; i++) addPost(c, "c" + i, "cat", "purr mom");
  for (let i = 0; i < 10; i++) addPost(c, "a" + i, "anime", "weeb mom");
  const r = rank(c);
  assert.strictEqual(r.cat[0].word, "purr");
  assert.strictEqual(r.anime[0].word, "weeb");
  assert.ok(![...r.cat, ...r.anime].some((x) => x.word === "mom" && Math.abs(x.lo) > 0.1));
});

test("classify picks the closer text embedding", () => {
  const p = classify([1, 0], [[1, 0.1], [0, 1]], ["cat", "anime"]);
  assert.ok(p.cat > 0.9);
});

test("classify sums several prompts per class", () => {
  const p = classify([1, 0], [[1, 0], [1, 0.05], [0, 1]], ["cat", "cat", "other"]);
  assert.ok(p.cat > 0.99 && p.other < 0.01);
});

test("an account counts once however many posts", () => {
  const c = newCounts();
  addPost(c, "x", "cat", "purr purr");
  addPost(c, "x", "cat", "purr again");
  assert.strictEqual(c.cat.n, 1);
  assert.strictEqual(c.cat.words.get("purr"), 1);
});

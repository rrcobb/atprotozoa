import { test } from "node:test";
import assert from "node:assert/strict";
import { signsInRange, signX, wrap, clip, SPACING, FIRST_X } from "../public/lib/signs.js";
import { simplify } from "../public/lib/post.js";

test("signsInRange lists sign indexes whose posts fall in view", () => {
  assert.deepEqual(signsInRange(0, FIRST_X - 1), []);
  assert.deepEqual(signsInRange(0, FIRST_X), [0]);
  const ks = signsInRange(FIRST_X + SPACING - 5, FIRST_X + 2 * SPACING + 5);
  assert.deepEqual(ks, [1, 2]);
  for (const k of ks) assert.equal(signX(k), FIRST_X + k * SPACING);
});

test("wrap breaks on words and splits overlong words", () => {
  const m = (t) => t.length;
  assert.deepEqual(wrap("aaa bbb ccc", 7, m), ["aaa bbb", "ccc"]);
  assert.ok(wrap("abcdefghijkl", 5, m).every((l) => l.length <= 5));
  assert.deepEqual(wrap("one\n\ntwo", 20, m), ["one", "two"]);
});

test("clip ends with an ellipsis only when cut", () => {
  assert.deepEqual(clip(["a", "b"], 3), ["a", "b"]);
  const c = clip(["a", "b", "c", "d"], 2);
  assert.equal(c.length, 2); assert.ok(c[1].endsWith("…"));
});

test("simplify keeps text, images and quotes; drops empties", () => {
  assert.equal(simplify({ post: { uri: "at://x/app.bsky.feed.post/1", record: { text: "  " } } }), null);
  const p = simplify({ post: { uri: "at://x/app.bsky.feed.post/1", author: { handle: "a.b" }, record: { text: "hi" },
    embed: { images: [{ thumb: "https://t/1.jpg" }] } } });
  assert.equal(p.text, "hi"); assert.equal(p.image, "https://t/1.jpg");
  const q = simplify({ post: { uri: "at://x/app.bsky.feed.post/2", author: { handle: "a.b" }, record: { text: "see" },
    embed: { record: { author: { handle: "c.d" }, value: { text: "quoted" } } } } });
  assert.equal(q.quote.text, "quoted");
});

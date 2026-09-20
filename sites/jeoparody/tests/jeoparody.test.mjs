// Unit tests for the pure logic in public/lib/jeoparody.js — the topic
// filter, the padding fallback, and alliterative clue generation. Nothing
// network-dependent (identity resolution, repo harvesting) is covered here;
// that's verified by hand against the live public AppView instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTopicWorthy, padTopics, clueFor } from "../public/lib/jeoparody.js";

test("isTopicWorthy rejects stopwords, junk, and vowel-less tokens", () => {
  assert.equal(isTopicWorthy("the"), false);
  assert.equal(isTopicWorthy("and"), false);
  assert.equal(isTopicWorthy("hp"), false); // too short
  assert.equal(isTopicWorthy("xyz"), false); // no vowel
  assert.equal(isTopicWorthy("a".repeat(20)), false); // too long
});

test("isTopicWorthy accepts an ordinary content word", () => {
  assert.equal(isTopicWorthy("coffee"), true);
  assert.equal(isTopicWorthy("microtubule"), true);
});

test("padTopics fills a short list up to five distinct topics", () => {
  const padded = padTopics([{ word: "coffee", count: 12 }], "some.handle");
  assert.equal(padded.length, 5);
  assert.equal(padded[0].word, "coffee");
  const words = new Set(padded.map((t) => t.word));
  assert.equal(words.size, 5); // no duplicate filler
});

test("padTopics is a no-op once there are already five topics", () => {
  const five = ["a", "b", "c", "d", "e"].map((w) => ({ word: w, count: 1 }));
  assert.deepEqual(padTopics(five, "handle"), five);
});

test("clueFor is deterministic for the same topic/handle/seed", () => {
  const a = clueFor("coffee", "vgel.me", "seed-1");
  const b = clueFor("coffee", "vgel.me", "seed-1");
  assert.deepEqual(a, b);
});

test("clueFor's alliterating words share the topic's first letter", () => {
  const { line1 } = clueFor("dragons", "someone", "abc");
  const words = line1
    .replace(/[,—]/g, "")
    .split(/\s+/)
    .filter((w) => w && w !== "and" && w !== "utterly");
  for (const w of words) assert.equal(w[0].toLowerCase(), "d", `"${w}" should start with d`);
});

test("clueFor falls back to a real word bank for a topic with no letters", () => {
  const { line1 } = clueFor("123", "someone", "seed");
  assert.ok(line1.length > 0);
});

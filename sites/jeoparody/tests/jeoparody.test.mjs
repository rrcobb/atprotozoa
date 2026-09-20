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

test("clueFor's first three stresses alliterate on the topic's first letter", () => {
  const { stresses } = clueFor("dragons", "someone", "abc");
  const [kenningNoun, adj2, adj3, freeword] = stresses;
  for (const w of [kenningNoun, adj2, adj3]) {
    assert.equal(w[0].toLowerCase(), "d", `"${w}" should start with d`);
  }
  // the fourth stress is deliberately free — the whole point of the form is
  // that it does NOT have to alliterate.
  assert.ok(freeword.length > 0);
});

test("clueFor's line1 is a kenning (compound noun) on a four-stress line", () => {
  const { line1, kenning } = clueFor("coffee", "someone", "seed-1");
  assert.match(kenning, /^[A-Z][a-z]+-[a-z]+$/); // e.g. "Cauldron-hoard"
  assert.ok(line1.startsWith(kenning));
  assert.match(line1, /—/); // caesura between the two half-lines
});

test("clueFor falls back to a real word bank for a topic with no letters", () => {
  const { line1 } = clueFor("123", "someone", "seed");
  assert.ok(line1.length > 0);
});

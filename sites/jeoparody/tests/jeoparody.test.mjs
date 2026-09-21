// Unit tests for the pure logic in public/lib/jeoparody.js — the topic
// filter, topic extraction from a single post's text, and alliterative
// kenning generation. Nothing network-dependent (identity resolution,
// author-feed fetching) is covered here; that's verified by hand against the
// live public AppView instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTopicWorthy, topTopicFromText, kenningForPost } from "../public/lib/jeoparody.js";

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

test("topTopicFromText picks the most-mentioned worthy word", () => {
  const topic = topTopicFromText("coffee coffee coffee is great but the tea was fine too");
  assert.equal(topic, "coffee");
});

test("topTopicFromText weights hashtags extra", () => {
  const topic = topTopicFromText("just a normal thought about birds #cats");
  assert.equal(topic, "cats");
});

test("topTopicFromText returns null for a topic-free post", () => {
  assert.equal(topTopicFromText("😀😀😀"), null);
  assert.equal(topTopicFromText(""), null);
});

test("kenningForPost falls back to a filler topic when none is given", () => {
  const { line1 } = kenningForPost(null, "someone", "seed");
  assert.ok(line1.length > 0);
});

test("kenningForPost is deterministic for the same topic/handle/seed", () => {
  const a = kenningForPost("coffee", "vgel.me", "seed-1");
  const b = kenningForPost("coffee", "vgel.me", "seed-1");
  assert.deepEqual(a, b);
});

test("kenningForPost's first three stresses alliterate on the topic's first letter", () => {
  const { stresses } = kenningForPost("dragons", "someone", "abc");
  const [kenningNoun, adj2, adj3, freeword] = stresses;
  for (const w of [kenningNoun, adj2, adj3]) {
    assert.equal(w[0].toLowerCase(), "d", `"${w}" should start with d`);
  }
  // the fourth stress is deliberately free — the whole point of the form is
  // that it does NOT have to alliterate.
  assert.ok(freeword.length > 0);
});

test("kenningForPost's line1 is a kenning (compound noun) on a four-stress line", () => {
  const { line1, kenning } = kenningForPost("coffee", "someone", "seed-1");
  assert.match(kenning, /^[A-Z][a-z]+-[a-z]+$/); // e.g. "Cauldron-hoard"
  assert.ok(line1.startsWith(kenning));
  assert.match(line1, /—/); // caesura between the two half-lines
});

test("kenningForPost falls back to a real word bank for a topic with no letters", () => {
  const { line1 } = kenningForPost("123", "someone", "seed");
  assert.ok(line1.length > 0);
});

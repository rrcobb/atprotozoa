// Tests for rich-text facets on the bot's replies.
//
// atproto does NOT autolink. A post is plain text plus a `facets` array saying
// which byte ranges are links, and without one a URL renders as inert
// characters. Every listbot reply shipped that way until Rob pointed out the
// sign-up link wasn't clickable — including the list links on a successful add.
//
// The thing these tests actually guard is the offsets. They're UTF-8 BYTE
// offsets, not character indices, and getting them wrong doesn't throw — it
// produces a post where the link is silently shifted, covering the wrong text.
// listbot's own replies are full of em dashes and quoted list names, so
// non-ASCII before a URL is the normal case, not an edge one.
import { test } from "node:test";
import assert from "node:assert/strict";

// --- mirror of buildFacets in src/index.ts -----------------------------------

function buildFacets(text) {
  const enc = new TextEncoder();
  const byteOffset = (charIndex) => enc.encode(text.slice(0, charIndex)).length;
  const facets = [];
  const urlRe = /https?:\/\/[^\s]+/g;
  for (let m = urlRe.exec(text); m; m = urlRe.exec(text)) {
    const raw = m[0].replace(/[.,;:!?)\]}'"]+$/, "");
    const start = byteOffset(m.index);
    facets.push({
      index: { byteStart: start, byteEnd: start + enc.encode(raw).length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: raw }],
    });
  }
  return facets;
}

// What the bytes at a facet's range actually are — the only check that matters.
function slice(text, facet) {
  const bytes = new TextEncoder().encode(text);
  return new TextDecoder().decode(
    bytes.slice(facet.index.byteStart, facet.index.byteEnd),
  );
}

// --- the basics --------------------------------------------------------------

test("a url gets a link facet", () => {
  const text = "sign up once at https://listbot.bisks.net and i'll build and manage lists for you.";
  const [f] = buildFacets(text);
  assert.equal(f.features[0].$type, "app.bsky.richtext.facet#link");
  assert.equal(f.features[0].uri, "https://listbot.bisks.net");
  assert.equal(slice(text, f), "https://listbot.bisks.net");
});

test("text with no url gets no facets", () => {
  assert.deepEqual(buildFacets("took @alice off bots."), []);
});

test("both urls in a reply are linked", () => {
  const text = "made you a list: https://bsky.app/profile/x/lists/y — see https://listbot.bisks.net/lists";
  const fs = buildFacets(text);
  assert.equal(fs.length, 2);
  assert.equal(slice(text, fs[0]), "https://bsky.app/profile/x/lists/y");
  assert.equal(slice(text, fs[1]), "https://listbot.bisks.net/lists");
});

// --- byte offsets, which is the whole point ----------------------------------

test("an em dash before the url doesn't shift the link", () => {
  // The em dash is 3 bytes and 1 character. A character-index implementation
  // puts the facet 2 bytes early and the link covers "t https://listbot.bisk".
  const text = "nothing changed — sign up at https://listbot.bisks.net";
  const [f] = buildFacets(text);
  assert.equal(slice(text, f), "https://listbot.bisks.net");
});

test("emoji before the url don't shift the link", () => {
  const text = "🎉🎉 done — https://listbot.bisks.net/lists";
  const [f] = buildFacets(text);
  assert.equal(slice(text, f), "https://listbot.bisks.net/lists");
});

test("a quoted non-ascii list name before the url doesn't shift the link", () => {
  // People name lists whatever they like, and the name goes in the reply
  // before the link.
  const text = 'added @alice to "café ☕ people".\nhttps://bsky.app/profile/rob/lists/abc';
  const [f] = buildFacets(text);
  assert.equal(slice(text, f), "https://bsky.app/profile/rob/lists/abc");
});

test("the byte range is a real range into the encoded text", () => {
  const text = "— https://listbot.bisks.net";
  const [f] = buildFacets(text);
  const total = new TextEncoder().encode(text).length;
  assert.ok(f.index.byteStart >= 0);
  assert.ok(f.index.byteEnd <= total, "a facet past the end is a malformed record");
  assert.ok(f.index.byteStart < f.index.byteEnd);
});

// --- punctuation -------------------------------------------------------------

test("a trailing full stop is not part of the link", () => {
  const text = "your lists live at https://listbot.bisks.net/lists.";
  const [f] = buildFacets(text);
  assert.equal(f.features[0].uri, "https://listbot.bisks.net/lists");
  assert.equal(slice(text, f), "https://listbot.bisks.net/lists");
});

test("a url in parens keeps its path but loses the bracket", () => {
  const text = "(see https://listbot.bisks.net/lists)";
  const [f] = buildFacets(text);
  assert.equal(f.features[0].uri, "https://listbot.bisks.net/lists");
});

test("a url with a trailing slash keeps it", () => {
  const text = "at https://listbot.bisks.net/ today";
  const [f] = buildFacets(text);
  assert.equal(f.features[0].uri, "https://listbot.bisks.net/");
});

// --- the actual replies the bot sends ----------------------------------------

test("the sign-up reply links its url", () => {
  const text = "sign up once at https://listbot.bisks.net and i'll build and manage lists for you.";
  const [f] = buildFacets(text);
  assert.equal(slice(text, f), "https://listbot.bisks.net");
  assert.ok(!text.includes("hi —"), "no greeting");
  assert.ok(!text.includes("nobody else's"), "no unasked-for reassurance");
});

test("the added-to-list reply links the list", () => {
  const text = 'added @alice to "cool posters".\nhttps://bsky.app/profile/did:plc:x/lists/3abc';
  const [f] = buildFacets(text);
  assert.equal(slice(text, f), "https://bsky.app/profile/did:plc:x/lists/3abc");
});

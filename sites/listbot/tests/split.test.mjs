// Splitting a long reply across posts.
//
// Replies used to be truncated at 280 with an ellipsis. Fine when every reply
// was "added @alice to ceramics", wrong the moment the bot could answer
// questions — "who's on that list?" for a 35-member list is a legitimately long
// answer and cutting it mid-handle turns a good answer into a broken one.
//
// The count is GRAPHEMES, because that's what Bluesky counts. Using .length
// counts UTF-16 code units, so an emoji costs 2 and a reply full of them gets
// cut well before the real limit.
import { test } from "node:test";
import assert from "node:assert/strict";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (t) => Array.from(segmenter.segment(t), (s) => s.segment);
const glen = (t) => graphemes(t).length;

// --- mirror of splitForPosts in src/index.ts ---------------------------------

function splitForPosts(text, limit = 280) {
  const t = text.trim();
  if (!t) return [];
  if (glen(t) <= limit) return [t];

  const parts = [];
  let rest = t;
  const room = limit - 5;

  while (glen(rest) > room) {
    const window = graphemes(rest).slice(0, room).join("");
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("\n"),
    );
    if (cut < room / 2) cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf(" "));
    if (cut < room / 2) cut = window.length;
    else cut += 1;

    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);

  return parts.length > 1 ? parts.map((p, i) => `${p} ${i + 1}/${parts.length}`) : parts;
}

// --- the common case ---------------------------------------------------------

test("a short reply is one post, unchanged and unnumbered", () => {
  const t = 'added @alice to "ceramics".';
  assert.deepEqual(splitForPosts(t), [t]);
});

test("a reply exactly at the limit is still one post", () => {
  const t = "x".repeat(280);
  const parts = splitForPosts(t);
  assert.equal(parts.length, 1);
  assert.ok(!parts[0].includes("1/"));
});

test("empty text produces no posts at all", () => {
  assert.deepEqual(splitForPosts(""), []);
  assert.deepEqual(splitForPosts("   "), []);
});

// --- splitting ---------------------------------------------------------------

test("a long reply splits and every part fits", () => {
  const t = Array.from({ length: 40 }, (_, i) => `@person${i}.bsky.social`).join(", ");
  const parts = splitForPosts(t);
  assert.ok(parts.length > 1, "should have split");
  for (const p of parts) {
    assert.ok(glen(p) <= 280, `part too long: ${glen(p)}`);
  }
});

test("parts are numbered so a reader knows there's more", () => {
  const t = "sentence. ".repeat(80);
  const parts = splitForPosts(t);
  assert.match(parts[0], / 1\/\d+$/);
  assert.match(parts[parts.length - 1], new RegExp(` ${parts.length}/${parts.length}$`));
});

test("nothing is lost in the split", () => {
  const t = Array.from({ length: 30 }, (_, i) => `@person${i}.bsky.social`).join(", ");
  const parts = splitForPosts(t);
  // Strip the counters and rejoin; every handle should still be there.
  const rejoined = parts.map((p) => p.replace(/ \d+\/\d+$/, "")).join(" ");
  for (let i = 0; i < 30; i++) {
    assert.ok(rejoined.includes(`@person${i}.bsky.social`), `lost @person${i}`);
  }
});

test("it breaks on a sentence end when there is one", () => {
  const long = "This is a full sentence that ends here. " .repeat(20);
  const parts = splitForPosts(long);
  // The first part should end at a sentence boundary, not mid-word.
  const first = parts[0].replace(/ \d+\/\d+$/, "");
  assert.ok(first.endsWith("."), `expected a sentence end, got: ...${first.slice(-30)}`);
});

test("it never cuts in the middle of a word", () => {
  const t = Array.from({ length: 60 }, (_, i) => `wordnumber${i}`).join(" ");
  const parts = splitForPosts(t);
  const rejoined = parts.map((p) => p.replace(/ \d+\/\d+$/, "")).join(" ");
  for (let i = 0; i < 60; i++) {
    assert.ok(rejoined.includes(`wordnumber${i}`), `split inside wordnumber${i}`);
  }
});

// --- graphemes, not code units -----------------------------------------------

test("emoji are counted as one character each, like Bluesky counts them", () => {
  // 200 emoji is 200 graphemes but 400 UTF-16 code units. Counting wrong here
  // would split a post that comfortably fits.
  const t = "🎉".repeat(200);
  assert.equal(glen(t), 200);
  assert.equal(t.length, 400);
  assert.deepEqual(splitForPosts(t), [t], "should not have split");
});

test("an emoji is never torn in half", () => {
  const t = "🎉".repeat(400);
  const parts = splitForPosts(t);
  for (const p of parts) {
    // A torn surrogate pair shows up as a lone replacement-range code unit.
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(p), "tore a surrogate pair");
    assert.ok(!/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p), "orphaned a low surrogate");
  }
});

test("a family emoji stays whole", () => {
  // ZWJ sequences are several code points and one grapheme.
  const family = "👨‍👩‍👧‍👦";
  assert.equal(glen(family), 1);
  const t = (family + " ").repeat(200);
  const parts = splitForPosts(t);
  const rejoined = parts.map((p) => p.replace(/ \d+\/\d+$/, "")).join(" ");
  assert.equal(rejoined.split(family).length - 1, 200, "lost or split a family emoji");
});

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

// --- the reply that got swallowed --------------------------------------------
//
// Rob asked the bot to find the spam accounts that followed it and add them all
// to his blocklist. It did — found 13 followers, identified 11 as spam, excluded
// him and a real account, added exactly the right 11. Then said nothing.
//
// The reply naming eleven handles came to 271 graphemes, plus a ~78-character
// list link: 349. Bluesky's limit is 300, the PDS rejected it with "grapheme
// too big (maximum 300, got 349)", and the error was logged and swallowed. The
// work was done and there was no sign of it.
//
// Two things were wrong. The composed reply didn't count the link it was about
// to append, and a rejected post produced silence instead of a shorter one.

const SPAM = [
  "w3tihw.bsky.social", "ew46g7rqw6d.bsky.social", "ewgu483.bsky.social",
  "3y982tq.bsky.social", "374tw8s.bsky.social", "643aos.bsky.social",
  "73-s428t.bsky.social", "v2y4sa.bsky.social", "45yg8ew.bsky.social",
  "0i-3dn.bsky.social", "ucx-s0sd.bsky.social",
];
const LINK = "\nhttps://bsky.app/profile/did:plc:f6n22z62adionrvb5s6n6vfk/lists/3mvrg7ovbmd2s";

// Mirror of the summarising branch in composeReply.
function composeWithLink(handles, listName, link, limit = 280) {
  let text = `added ${handles.map((h) => "@" + h).join(", ")} to "${listName}".`;
  if (glen(text + link) > limit) {
    text = `added ${handles.length} accounts to "${listName}".`;
  }
  return text + link;
}

test("the real case fits once the link is counted", () => {
  const out = composeWithLink(SPAM, "people I blocked", LINK);
  assert.ok(glen(out) <= 300, `still too long: ${glen(out)}`);
  assert.match(out, /added 11 accounts to "people I blocked"\./);
});

test("naming everyone is kept when it fits", () => {
  const two = SPAM.slice(0, 2);
  const out = composeWithLink(two, "people I blocked", LINK);
  assert.ok(out.includes("@" + two[0]), "should still name them");
  assert.ok(!out.includes("2 accounts"), "shouldn't summarise a short list");
});

test("a single person is named, never summarised as '1 accounts'", () => {
  const out = composeWithLink([SPAM[0]], "people I blocked", LINK);
  assert.ok(out.includes("@" + SPAM[0]));
  assert.ok(!out.includes("1 accounts"));
});

test("the link survives summarising — it's how you see who was added", () => {
  const out = composeWithLink(SPAM, "people I blocked", LINK);
  assert.ok(out.includes("https://bsky.app/profile/"), "dropped the link");
});

// --- the bot doesn't name people it put on a blocklist -----------------------
//
// The handles carry no mention facet, so nobody is notified. But the post is
// public and it's the BOT saying these accounts belong on a blocklist. The list
// is the user's own business; a reply naming its members in the open is
// listbot's doing, and that isn't its call to make about anyone.

function replyFor(handles, listName, purpose) {
  const quiet = purpose === "modlist";
  const n = handles.length;
  const who = quiet ? (n === 1 ? "them" : `${n} accounts`) : handles.map((h) => "@" + h).join(", ");
  return `added ${who} to "${listName}".`;
}

test("a blocklist add names nobody", () => {
  const out = replyFor(SPAM, "people I blocked", "modlist");
  assert.equal(out, 'added 11 accounts to "people I blocked".');
  for (const h of SPAM) assert.ok(!out.includes(h), `named ${h}`);
});

test("even two people on a blocklist go unnamed", () => {
  // The length-based summarising happened to hide eleven. Two would have been
  // named, which is the same problem at a size that fits.
  const out = replyFor(SPAM.slice(0, 2), "people I blocked", "modlist");
  assert.ok(!out.includes("@"), `named someone: ${out}`);
  assert.match(out, /2 accounts/);
});

test("one person on a blocklist is 'them', not a handle", () => {
  const out = replyFor([SPAM[0]], "people I blocked", "modlist");
  assert.ok(!out.includes(SPAM[0]));
  assert.match(out, /added them to/);
});

test("a curation list still names people — that's the useful confirmation", () => {
  const out = replyFor(["alice.bsky.social"], "ceramics", "curatelist");
  assert.match(out, /@alice\.bsky\.social/);
});

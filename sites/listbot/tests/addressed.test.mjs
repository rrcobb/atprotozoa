// Is this post addressed to the bot?
//
// Got this wrong three times, each time dropping a real tag in SILENCE, which
// is the worst failure this bot has — the watcher writes a handled: marker
// before acting, so a dropped tag is dropped forever, not retried.
//
//   1. Required a repeated @mention on every reply. "ok cool add fleetingbits",
//      a direct reply to the bot, was invisible. Nobody re-@s someone
//      mid-conversation.
//   2. Fixed that by checking the parent only. "yea have another go at adding
//      fleetingbits" replied to Rob's OWN previous message and was still
//      invisible.
//   3. Overcorrected to "any reply notification counts" — but those arrive for
//      any post in a thread the bot once spoke in, including strangers talking
//      to each other. Rob: "if the bot isn't actually _addressed_ as the
//      recipient of the message it doesn't have to weigh in."
//
// So: addressed, not merely present.
import { test } from "node:test";
import assert from "node:assert/strict";

const BOT = "did:plc:bot";
const ROB = "did:plc:rob";
const OTHER = "did:plc:other";

const post = (author, rkey) => `at://${author}/app.bsky.feed.post/${rkey}`;

// --- mirror of the filter in src/index.ts ------------------------------------

const isOurs = (uri) => Boolean(uri && uri.includes(`/${BOT}/`));

function mentionsUs(rec) {
  return (rec.facets ?? []).some((f) =>
    (f.features ?? []).some(
      (feat) => feat.$type === "app.bsky.richtext.facet#mention" && feat.did === BOT,
    ),
  );
}

const MAX_EXCHANGE_HOPS = 6;

// `parents` stands in for the AppView lookup of a post's own parent.
async function addressedToUs(n, parents) {
  const rec = n.record ?? {};
  if (n.reason === "mention") return true;
  if (n.reason !== "reply") return false;
  if (mentionsUs(rec)) return true;
  const parent = rec.reply?.parent?.uri;
  if (isOurs(parent)) return true;
  if (!parent) return false;

  // Walk up the unbroken run of this author's own posts; the first post that
  // isn't theirs ends it, and whether THAT one is ours decides.
  let cursor = parent;
  for (let hop = 0; hop < MAX_EXCHANGE_HOPS; hop++) {
    if (!cursor) return false;
    if (!cursor.includes(`/${n.author.did}/`)) return isOurs(cursor);
    cursor = parents[cursor];
  }
  return false;
}

const reply = (author, parentUri, opts = {}) => ({
  reason: "reply",
  author: { did: author },
  record: { text: opts.text ?? "", reply: { parent: { uri: parentUri } }, ...opts.rec },
});

// --- the cases that were dropped ---------------------------------------------

test("a direct reply to the bot is addressed to it, mention or not", async () => {
  // "ok cool add fleetingbits" — case 1.
  const n = reply(ROB, post(BOT, "botpost"));
  assert.equal(await addressedToUs(n, {}), true);
});

test("a follow-up to your own message in the exchange is still addressed to it", async () => {
  // "yea have another go at adding fleetingbits" — case 2. Rob replies to his
  // own earlier post, which was itself a reply to the bot.
  const mine = post(ROB, "mine");
  const n = reply(ROB, mine);
  assert.equal(await addressedToUs(n, { [mine]: post(BOT, "botpost") }), true);
});

// --- what must NOT be picked up ----------------------------------------------

test("two other people talking in a thread the bot spoke in is not addressed to it", async () => {
  // Case 3, the overcorrection. A reply notification arrives here, and the bot
  // has no business answering.
  const theirs = post(OTHER, "theirs");
  const n = reply(OTHER, theirs);
  assert.equal(await addressedToUs(n, { [theirs]: post(OTHER, "earlier") }), false);
});

test("someone replying to a third party is not addressed to it", async () => {
  const n = reply(ROB, post(OTHER, "someonespost"));
  assert.equal(await addressedToUs(n, {}), false);
});

test("a run of your own posts stays addressed to it however deep", async () => {
  // The case the old one-level version got wrong: it stopped listening at the
  // third message. A conversation doesn't stop at a fixed depth.
  const first = post(ROB, "first");
  const second = post(ROB, "second");
  const third = post(ROB, "third");
  const parents = {
    [first]: post(BOT, "botpost"),
    [second]: first,
    [third]: second,
  };
  // Replying to your own fourth message, four deep from the bot's post.
  const n = reply(ROB, third);
  assert.equal(await addressedToUs(n, parents), true);
});

test("someone else speaking ends the run", async () => {
  // The other direction the old version got wrong. Rob talked to the bot early,
  // then someone else replied, and the conversation moved on. A later
  // follow-up isn't the bot's to answer even though the bot is up the thread.
  const mine = post(ROB, "mine");
  const interruption = post(OTHER, "interruption");
  const parents = {
    [mine]: interruption,
    [interruption]: post(BOT, "botpost"),
  };
  const n = reply(ROB, mine);
  assert.equal(await addressedToUs(n, parents), false);
});

test("a run deeper than the hop limit gives up rather than looping", async () => {
  // Runaway guard. Each hop is an API call.
  const parents = {};
  let prev = post(ROB, "p0");
  for (let i = 1; i <= 20; i++) {
    const cur = post(ROB, `p${i}`);
    parents[cur] = prev;
    prev = cur;
  }
  const n = reply(ROB, prev);
  assert.equal(await addressedToUs(n, parents), false);
});

test("your own follow-up is NOT addressed to it if the exchange wasn't with the bot", async () => {
  // Rob replying to himself in a thread where the previous post went to someone
  // else. The bot stays out.
  const mine = post(ROB, "mine");
  const n = reply(ROB, mine);
  assert.equal(await addressedToUs(n, { [mine]: post(OTHER, "theirs") }), false);
});

// --- the straightforward ones ------------------------------------------------

test("an explicit mention is always addressed to it", async () => {
  const n = {
    reason: "mention",
    author: { did: ROB },
    record: { text: "@listbot.bisks.net bots" },
  };
  assert.equal(await addressedToUs(n, {}), true);
});

test("a reply carrying a mention facet is addressed to it", async () => {
  const n = reply(ROB, post(OTHER, "x"), {
    rec: {
      facets: [
        { features: [{ $type: "app.bsky.richtext.facet#mention", did: BOT }] },
      ],
    },
  });
  assert.equal(await addressedToUs(n, {}), true);
});

test("a mention facet for someone else doesn't count", async () => {
  const n = reply(ROB, post(OTHER, "x"), {
    rec: {
      facets: [
        { features: [{ $type: "app.bsky.richtext.facet#mention", did: OTHER }] },
      ],
    },
  });
  assert.equal(await addressedToUs(n, {}), false);
});

test("a like or follow notification is never a tag", async () => {
  for (const reason of ["like", "follow", "repost", "quote"]) {
    const n = { reason, author: { did: ROB }, record: {} };
    assert.equal(await addressedToUs(n, {}), false, `${reason} should not be a tag`);
  }
});

test("a reply with no parent at all is not addressed to it", async () => {
  const n = { reason: "reply", author: { did: ROB }, record: { text: "hi" } };
  assert.equal(await addressedToUs(n, {}), false);
});

test("the bot speaking mid-run keeps it addressed", async () => {
  // A real back-and-forth alternates. Rob, bot, Rob, bot, Rob — the walk hits
  // the bot's post and that's the answer, not an interruption.
  const mine = post(ROB, "mine");
  const parents = { [mine]: post(BOT, "botreply") };
  const n = reply(ROB, mine);
  assert.equal(await addressedToUs(n, parents), true);
});

test("a run that walks off the top of the thread isn't addressed to it", async () => {
  // The first post in a thread has no parent. Walking past it must terminate
  // rather than treat undefined as a match.
  const mine = post(ROB, "mine");
  const n = reply(ROB, mine);
  assert.equal(await addressedToUs(n, {}), false);
});

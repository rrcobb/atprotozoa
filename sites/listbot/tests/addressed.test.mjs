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

// `parents` stands in for the AppView lookup of a post's own parent.
async function addressedToUs(n, parents) {
  const rec = n.record ?? {};
  if (n.reason === "mention") return true;
  if (n.reason !== "reply") return false;
  if (mentionsUs(rec)) return true;
  const parent = rec.reply?.parent?.uri;
  if (isOurs(parent)) return true;
  if (!parent) return false;
  if (!parent.includes(`/${n.author.did}/`)) return false;
  return isOurs(parents[parent]);
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

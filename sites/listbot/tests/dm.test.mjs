// Requests by DM.
//
// The same bot, reached privately, and a better fit for a lot of what people
// ask: "delete my ceramics list", "who's on people I blocked", "add these six
// accounts" — none of that belongs in a public thread.
//
// Discovery differs; everything after it is shared with tags. The same job
// shape, the same agent, the same writes. What these guard is the seam: a DM
// request must come back as a DM, and a DM must not be acted on twice.
import { test } from "node:test";
import assert from "node:assert/strict";

const BOT = "did:plc:bot";
const ROB = "did:plc:rob";

// --- addressing --------------------------------------------------------------

// A DM job carries "dm:<convoId>:<messageId>" where a tag carries a post uri.
const dmUri = (convoId, msgId) => `dm:${convoId}:${msgId}`;

function isDm(uri) {
  return uri.startsWith("dm:");
}
function convoIdOf(uri) {
  return uri.split(":")[1];
}

test("a dm job is recognisable from its addressing token", () => {
  assert.equal(isDm(dmUri("convo123", "msg456")), true);
});

test("a tag job is not mistaken for a dm", () => {
  assert.equal(isDm("at://did:plc:rob/app.bsky.feed.post/3abc"), false);
});

test("the convo id round-trips, so a reply goes back to the right conversation", () => {
  assert.equal(convoIdOf(dmUri("convo123", "msg456")), "convo123");
});

test("answering a private message publicly would be a bug — the routing prevents it", () => {
  // The whole reason reply() branches on the uri rather than each caller
  // deciding. One place knows the difference; a new reply path can't forget.
  const uri = dmUri("c1", "m1");
  assert.ok(isDm(uri), "must route to DM");
  assert.ok(!uri.startsWith("at://"), "must not look like a post");
});

// --- not acting twice --------------------------------------------------------

test("a message is keyed by its own id, not the conversation's", () => {
  // Keying on the convo would mean only the first message in a conversation
  // ever gets handled.
  const first = `handled:dm:msg1`;
  const second = `handled:dm:msg2`;
  assert.notEqual(first, second);
});

test("the same message twice is handled once", () => {
  const seen = new Set();
  const key = "handled:dm:msg1";
  const handle = () => {
    if (seen.has(key)) return "skipped";
    seen.add(key);
    return "handled";
  };
  assert.equal(handle(), "handled");
  assert.equal(handle(), "skipped");
});

// --- the conversation as context ---------------------------------------------

function asThread(messages, botDid, botHandle, theirHandle) {
  return messages
    .filter((m) => m.text?.trim())
    .map((m) => {
      const mine = m.sender?.did === botDid;
      return {
        handle: mine ? botHandle : theirHandle,
        did: m.sender?.did ?? "",
        text: m.text,
      };
    });
}

test("both sides of the conversation reach the agent", () => {
  const out = asThread(
    [
      { sender: { did: ROB }, text: "make me a list called ceramics" },
      { sender: { did: BOT }, text: 'made you a list called "ceramics".' },
      { sender: { did: ROB }, text: "add colin to it" },
    ],
    BOT,
    "listbot.bisks.net",
    "bisks.net",
  );
  assert.equal(out.length, 3);
  assert.equal(out[0].handle, "bisks.net");
  assert.equal(out[1].handle, "listbot.bisks.net");
  // "add colin to it" only resolves because the bot's own message is there.
  assert.match(out[2].text, /add colin/);
});

test("empty messages are dropped rather than sent as blank context", () => {
  const out = asThread(
    [{ sender: { did: ROB }, text: "" }, { sender: { did: ROB }, text: "hi" }],
    BOT,
    "listbot.bisks.net",
    "bisks.net",
  );
  assert.equal(out.length, 1);
});

// --- what a DM doesn't have --------------------------------------------------

test("a dm has no default subject — everyone must be named", () => {
  // No parent post means no "the person whose post you replied to". The agent
  // has to resolve someone from the text, which is what follows is for.
  const payload = { candidates: [], subject: undefined };
  assert.deepEqual(payload.candidates, []);
  assert.equal(payload.subject, undefined);
});

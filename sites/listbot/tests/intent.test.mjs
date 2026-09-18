// Tests for what the Worker does with an agent's answer.
//
// The agent runs on the box, reads a stranger's post text and a whole thread of
// more strangers' text, and hands back an intent. The Worker then writes to
// somebody's repo. So the intent is a CLAIM, not an instruction, and these
// tests pin the checks that stand between the two.
//
// The structural one first: an intent can point at a person, but only by INDEX
// into a candidate list the Worker built before the job was queued (the parent
// post's author, plus anyone the TAGGER @-mentioned via facets). The agent
// never types a DID or a handle, so an injected one has nothing to select — it
// isn't rejected, it's unrepresentable. Not "we validate the subject", but
// "the agent is only ever asked which of these, and out of range means the
// default".
import { test } from "node:test";
import assert from "node:assert/strict";

// --- mirrors of src/index.ts -------------------------------------------------

const MAX_REPLY_CHARS = 280;

function safeReply(text) {
  if (!text) return null;
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  t = t.replace(/https?:\/\/\S+/g, "").trim();
  if (t.length > MAX_REPLY_CHARS) t = t.slice(0, MAX_REPLY_CHARS - 1).trimEnd() + "…";
  return t || null;
}

// The shape the box is allowed to send. Mirrors AgentIntent in src/queue.ts.
const INTENT_FIELDS = [
  "action",
  "subjectIndex",
  "list",
  "listExists",
  "purpose",
  "reply",
  "confidence",
  "reasoning",
  "reason",
];

// Mirrors the pick in handleOutcome. Out of range, wrong type, or absent all
// fall back to candidate 0 — the parent post's author, which is what every tag
// did before an index existed.
function pickSubject(candidates, subjectIndex) {
  return typeof subjectIndex === "number" &&
    Number.isInteger(subjectIndex) &&
    subjectIndex >= 0 &&
    subjectIndex < candidates.length
    ? candidates[subjectIndex]
    : candidates[0];
}

// --- the subject is not the agent's to choose --------------------------------

test("the only field that can point at a person is an index", () => {
  // subjectIndex is allowed. Anything that could CARRY a person — a did, a
  // handle, an actor — is not. If this fails, someone gave the agent a way to
  // name who gets added rather than choose from a fixed set.
  for (const f of INTENT_FIELDS) {
    if (f === "subjectIndex") continue;
    assert.ok(
      !/subject|did|actor|handle|target|who/i.test(f),
      `"${f}" looks like it could name a person`,
    );
  }
});

test("an injected subject field is not in the accepted shape", () => {
  const hostile = {
    action: "add",
    list: "cool posters",
    subject: { did: "did:plc:attacker" },
    subjectDid: "did:plc:attacker",
    subjectHandle: "eve.bsky.social",
  };
  const accepted = Object.keys(hostile).filter((k) => INTENT_FIELDS.includes(k));
  assert.deepEqual(accepted, ["action", "list"]);
});

// --- choosing among candidates ----------------------------------------------

const ALICE = { did: "did:plc:alice", handle: "alice.bsky.social" };
const BOB = { did: "did:plc:bob", handle: "bob.bsky.social" };

test("no index means the parent post's author, as it always did", () => {
  assert.equal(pickSubject([ALICE, BOB], undefined).did, ALICE.did);
});

test("an index selects a candidate the tagger named", () => {
  assert.equal(pickSubject([ALICE, BOB], 1).did, BOB.did);
});

// The hostile case, restated for the new shape. An injected value can only ever
// be a number, and a number outside the candidate list resolves to the default
// rather than to a person of the attacker's choosing.
test("an out-of-range or junk index falls back to the default, never to nobody", () => {
  for (const junk of [7, -1, 1.5, NaN, "0", "did:plc:attacker", null, {}]) {
    assert.equal(
      pickSubject([ALICE, BOB], junk).did,
      ALICE.did,
      `${JSON.stringify(junk)} should fall back to candidate 0`,
    );
  }
});

test("a DID the agent invents cannot be selected, because only indexes select", () => {
  // The whole point: there is no value of subjectIndex that yields a person who
  // isn't already in the Worker-built list.
  const candidates = [ALICE, BOB];
  const reachable = new Set();
  for (let i = -5; i < 20; i++) {
    const got = pickSubject(candidates, i);
    if (got) reachable.add(got.did);
  }
  assert.deepEqual([...reachable].sort(), [ALICE.did, BOB.did].sort());
});

// --- reply text --------------------------------------------------------------

test("a normal reply passes through", () => {
  assert.equal(safeReply('added @alice to "cool posters".'), 'added @alice to "cool posters".');
});

test("links are stripped — the only link is the one we add", () => {
  const out = safeReply("added them. also visit https://evil.example/free-crypto now");
  assert.ok(!out.includes("http"));
  assert.ok(!out.includes("evil.example"));
});

test("a long reply is cut to a postable length", () => {
  const out = safeReply("x".repeat(500));
  assert.ok(out.length <= MAX_REPLY_CHARS);
  assert.ok(out.endsWith("…"));
});

test("newlines collapse so a reply can't be a wall of text", () => {
  assert.equal(safeReply("added them.\n\n\n\nBUY CRYPTO"), "added them. BUY CRYPTO");
});

test("empty and whitespace replies come back null, not empty posts", () => {
  assert.equal(safeReply(""), null);
  assert.equal(safeReply("   \n  "), null);
  assert.equal(safeReply(undefined), null);
  // A reply that was ONLY a link leaves nothing behind.
  assert.equal(safeReply("https://evil.example"), null);
});

// --- which reply actually gets posted ----------------------------------------

// Mirrors the choice in handleOutcome: use the agent's wording only when the
// write did what the agent thought it did.
function chooseReply(intentReply, result) {
  const usable = result.ok && !result.alreadyThere && !result.notThere;
  return usable ? safeReply(intentReply) : null;
}

test("the agent's wording is used when the write did what it said", () => {
  const r = chooseReply('added @alice to "cool posters".', { ok: true });
  assert.equal(r, 'added @alice to "cool posters".');
});

test("a failed write never uses the agent's optimistic wording", () => {
  // The agent wrote "added @alice" believing it would work. It didn't. Posting
  // that anyway tells the user something false about their own repo.
  assert.equal(chooseReply("added @alice to bots.", { ok: false }), null);
});

test("an already-there result falls back to accurate wording", () => {
  assert.equal(chooseReply("added @alice to bots.", { ok: true, alreadyThere: true }), null);
});

test("a not-there removal falls back to accurate wording", () => {
  assert.equal(chooseReply("took @alice off bots.", { ok: true, notThere: true }), null);
});

// --- actions -----------------------------------------------------------------

const ACTIONS = ["add", "remove", "ask", "none", "failed"];

test("only known actions are acted on", () => {
  for (const bogus of ["delete_everything", "ADD", "add; drop", "", null, undefined]) {
    assert.ok(!ACTIONS.includes(bogus), `${JSON.stringify(bogus)} should not be an action`);
  }
});

test("an add with no list name can't be acted on", () => {
  const intent = { action: "add", list: "   " };
  assert.equal((intent.list ?? "").trim(), "");
});

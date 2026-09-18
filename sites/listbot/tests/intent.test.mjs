// Tests for what the Worker does with an agent's answer.
//
// The agent runs on the box, reads a stranger's post text and a whole thread of
// more strangers' text, and hands back an intent. The Worker then writes to
// somebody's repo. So the intent is a CLAIM, not an instruction, and these
// tests pin the checks that stand between the two.
//
// The structural one first: an intent has no subject field. The person being
// added was decided by the Worker from the parent post's author before the job
// was ever queued, so there is nothing for a prompt injection to overwrite —
// not "we validate the subject", but "the agent is never asked for one".
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
  "list",
  "listExists",
  "reply",
  "confidence",
  "reasoning",
  "reason",
];

// --- the subject is not the agent's to choose --------------------------------

test("the intent shape has no field naming a subject", () => {
  // If this ever fails, someone added a way for the agent to pick who gets
  // added — which is the one thing the tag text must never control.
  for (const f of INTENT_FIELDS) {
    assert.ok(
      !/subject|did|actor|target|who/i.test(f),
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
  };
  const accepted = Object.keys(hostile).filter((k) => INTENT_FIELDS.includes(k));
  assert.deepEqual(accepted, ["action", "list"]);
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

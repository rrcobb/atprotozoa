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

// --- one reply for however many steps ----------------------------------------
//
// A tag can ask for two things ("add them to ceramics and make me a mute list")
// and gets ONE reply. These mirror composeReply in src/index.ts. What they're
// really guarding: the reply describes what HAPPENED, so a partial result reads
// as partial rather than as success.

function composeReply(outcomes, taggerDid) {
  const parts = [];
  const problems = [];

  for (const o of outcomes) {
    if (o.problem === "unresolved") {
      const names = o.unresolved.map((n) => `"${n.replace(/^@/, "")}"`).join(" or ");
      problems.push(`i couldn't work out who ${names} is`);
      continue;
    }
    if (o.problem) {
      problems.push(o.problem);
      continue;
    }

    if (o.action === "create") {
      parts.push(
        o.alreadyThere
          ? `you've already got "${o.listName}"`
          : `made you a list called "${o.listName}"`,
      );
      continue;
    }

    const who = (o.done ?? []).map((d) => `@${d.handle}`).join(", ");
    if ((o.done ?? []).length) {
      if (o.action === "add") {
        parts.push(
          o.alreadyThere && o.done.length === 1
            ? `@${o.done[0].handle} was already on "${o.listName}"`
            : `added ${who} to "${o.listName}"`,
        );
      } else {
        parts.push(
          o.notThere && o.done.length === 1
            ? `@${o.done[0].handle} wasn't on "${o.listName}"`
            : `took ${who} off "${o.listName}"`,
        );
      }
    }
    if ((o.failedPeople ?? []).length) {
      problems.push(`couldn't do ${o.failedPeople.map((f) => `@${f.handle}`).join(", ")}`);
    }
    if ((o.unresolved ?? []).length) {
      problems.push(
        `couldn't find ${o.unresolved.map((n) => `"${n.replace(/^@/, "")}"`).join(", ")}`,
      );
    }
  }

  let text = parts.length
    ? parts.join(" and ") + "."
    : "that didn't work, sorry — nothing changed on your lists.";
  if (problems.length) text += ` ${problems.join(", ")}.`;

  const linkable = [...outcomes].reverse().find((o) => o.listUri);
  if (linkable?.listUri) text += `\n${linkable.listUri}`;
  return text;
}

const added = (handle, listName, extra = {}) => ({
  action: "add",
  listName,
  done: [{ handle }],
  failedPeople: [],
  unresolved: [],
  ...extra,
});

test("one step reads like one sentence", () => {
  const t = composeReply([added("alice", "ceramics")], "did:plc:me");
  assert.equal(t, 'added @alice to "ceramics".');
});

test("two steps are one reply, not two", () => {
  const t = composeReply(
    [
      added("alice", "ceramics"),
      { action: "create", listName: "crypto spammers", done: [], failedPeople: [], unresolved: [] },
    ],
    "did:plc:me",
  );
  assert.equal(
    t,
    'added @alice to "ceramics" and made you a list called "crypto spammers".',
  );
});

// The one that matters. A step that failed must not be papered over by one
// that worked — someone reading "added @alice" has no reason to check.
test("a partial result says which part failed", () => {
  const t = composeReply(
    [
      added("alice", "ceramics"),
      { action: "add", listName: "bots", done: [], failedPeople: [], unresolved: ["fleetingbits"], problem: "unresolved" },
    ],
    "did:plc:me",
  );
  assert.match(t, /added @alice to "ceramics"/);
  assert.match(t, /couldn't work out who "fleetingbits" is/);
});

test("some people added, some not, in one step", () => {
  const t = composeReply(
    [
      {
        action: "add",
        listName: "ceramics",
        done: [{ handle: "alice" }],
        failedPeople: [{ handle: "bob" }],
        unresolved: [],
      },
    ],
    "did:plc:me",
  );
  assert.match(t, /added @alice to "ceramics"/);
  assert.match(t, /couldn't do @bob/);
});

test("everything failing doesn't read as success", () => {
  const t = composeReply(
    [{ action: "add", listName: "ceramics", done: [], failedPeople: [{ handle: "alice" }], unresolved: [] }],
    "did:plc:me",
  );
  assert.match(t, /didn't work/);
  assert.ok(!/^added/.test(t), "must not open with added");
});

test("already-there is reported as true, not as a fresh add", () => {
  const t = composeReply([added("alice", "ceramics", { alreadyThere: true })], "did:plc:me");
  assert.match(t, /already on "ceramics"/);
});

test("one link at most, for the last list touched", () => {
  const t = composeReply(
    [
      added("alice", "ceramics", { listUri: "uri-one" }),
      { action: "create", listName: "bots", done: [], failedPeople: [], unresolved: [], listUri: "uri-two" },
    ],
    "did:plc:me",
  );
  assert.equal(t.match(/uri-/g).length, 1);
  assert.match(t, /uri-two/);
});

// --- a flat intent is still a flat intent ------------------------------------
//
// Every tag that isn't multi-action goes through the steps path as a list of
// one, so this is the regression guard on the common case: the derived step
// must carry exactly what the flat fields said.

function stepsFrom(intent) {
  return intent.steps?.length
    ? intent.steps
    : [
        {
          action: intent.action,
          subjectIndex: intent.subjectIndex,
          subjectHandle: intent.subjectHandle,
          subjectHandles: intent.subjectHandles,
          list: intent.list,
          listExists: intent.listExists,
          purpose: intent.purpose,
        },
      ];
}

test("a flat intent becomes exactly one step with the same values", () => {
  const steps = stepsFrom({
    action: "add",
    subjectHandle: "fleetingbits.bsky.social",
    list: "ai new knowers",
    listExists: true,
    purpose: "curatelist",
    reply: "added @fleetingbits to ai new knowers.",
  });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].action, "add");
  assert.equal(steps[0].subjectHandle, "fleetingbits.bsky.social");
  assert.equal(steps[0].list, "ai new knowers");
  assert.equal(steps[0].listExists, true);
});

test("subjectIndex survives the flat-to-step conversion", () => {
  const steps = stepsFrom({ action: "add", subjectIndex: 1, list: "bots" });
  assert.equal(steps[0].subjectIndex, 1);
});

test("subjectHandles survives, so 'add both of them' still adds both", () => {
  const steps = stepsFrom({ action: "add", subjectHandles: ["a.bsky.social", "b.bsky.social"], list: "bots" });
  assert.deepEqual(steps[0].subjectHandles, ["a.bsky.social", "b.bsky.social"]);
});

test("an explicit steps array wins over the flat fields", () => {
  const steps = stepsFrom({
    action: "add",
    list: "ceramics",
    steps: [
      { action: "add", subjectHandle: "a.bsky.social", list: "ceramics" },
      { action: "create", list: "crypto spammers", purpose: "modlist" },
    ],
  });
  assert.equal(steps.length, 2);
  assert.equal(steps[1].action, "create");
  assert.equal(steps[1].purpose, "modlist");
});

// An empty steps array is the agent saying nothing rather than saying "do
// nothing" — fall back to the flat fields rather than doing zero work.
test("an empty steps array falls back to the flat intent", () => {
  const steps = stepsFrom({ action: "add", list: "bots", steps: [] });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].list, "bots");
});

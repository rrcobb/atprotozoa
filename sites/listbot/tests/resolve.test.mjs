// Tests for turning what someone SAID into an account.
//
// This is the bot's core competence and it was the thing it couldn't do. Rob's
// test was "ok cool add fleetingbits" — shorthand, not a handle, an account he
// follows — and his standard was "the bot has to be able to speak fluent
// atproto... zero misses".
//
// An earlier design had the agent pick only from a Worker-built array, which
// made this case structurally impossible. That bought a guarantee priced for a
// threat that isn't here: a listitem lands in the tagger's OWN list, the reply
// names who was added, one tap undoes it. So the agent may name someone, and
// this resolution decides whether that becomes a record.
//
// What must still hold: a name the agent INVENTED resolves to nobody and is
// reported, rather than quietly resolving to the wrong person.
import { test } from "node:test";
import assert from "node:assert/strict";

// --- mirror of resolvePerson in src/index.ts ---------------------------------

// Stands in for resolveHandle against the network.
const NETWORK = {
  "fleetingbits.bsky.social": "did:plc:fleeting",
  "alice.bsky.social": "did:plc:alice",
};

async function resolvePerson(named, pools, network = NETWORK) {
  const want = String(named).trim().replace(/^@/, "").toLowerCase();
  if (!want) return null;
  if (want.startsWith("did:")) return { did: String(named).trim(), handle: String(named).trim() };

  const all = pools.flat();

  const exact = all.find((p) => p.handle.toLowerCase() === want);
  if (exact) return { did: exact.did, handle: exact.handle };

  if (want.includes(".")) {
    const did = network[want];
    if (did) return { did, handle: want };
  }

  const prefix = all.filter((p) => p.handle.toLowerCase().split(".")[0] === want);
  if (prefix.length === 1) return { did: prefix[0].did, handle: prefix[0].handle };

  const byName = all.filter((p) => (p.displayName ?? "").toLowerCase() === want);
  if (byName.length === 1) return { did: byName[0].did, handle: byName[0].handle };

  return null;
}

const FOLLOWS = [
  { did: "did:plc:fleeting", handle: "fleetingbits.bsky.social", displayName: "fleeting bits" },
  { did: "did:plc:paul", handle: "pgraham.bsky.social", displayName: "Paul" },
  { did: "did:plc:alice", handle: "alice.bsky.social", displayName: "Alice" },
];
const CANDIDATES = [
  { did: "did:plc:parent", handle: "parentauthor.bsky.social" },
];
const THREAD = [{ did: "did:plc:chart", handle: "chartposter.bsky.social" }];
const POOLS = [CANDIDATES, FOLLOWS, THREAD];

// --- the case that started this ----------------------------------------------

test("'fleetingbits' resolves to the followed account", async () => {
  // THE test. Shorthand, no domain, someone the tagger follows.
  const r = await resolvePerson("fleetingbits", POOLS);
  assert.equal(r.did, "did:plc:fleeting");
  assert.equal(r.handle, "fleetingbits.bsky.social");
});

test("'@fleetingbits' with the at-sign works the same", async () => {
  const r = await resolvePerson("@fleetingbits", POOLS);
  assert.equal(r.did, "did:plc:fleeting");
});

test("a full handle resolves", async () => {
  const r = await resolvePerson("fleetingbits.bsky.social", POOLS);
  assert.equal(r.did, "did:plc:fleeting");
});

test("a display name resolves — 'add Paul' is normal speech", async () => {
  const r = await resolvePerson("Paul", POOLS);
  assert.equal(r.did, "did:plc:paul");
});

test("case doesn't matter", async () => {
  assert.equal((await resolvePerson("FleetingBits", POOLS)).did, "did:plc:fleeting");
  assert.equal((await resolvePerson("paul", POOLS)).did, "did:plc:paul");
});

test("a DID passes straight through", async () => {
  const r = await resolvePerson("did:plc:whoever", POOLS);
  assert.equal(r.did, "did:plc:whoever");
});

// --- where people come from --------------------------------------------------

test("someone in the thread resolves even if not followed", async () => {
  // "add the person who posted the chart".
  const r = await resolvePerson("chartposter.bsky.social", POOLS);
  assert.equal(r.did, "did:plc:chart");
});

test("a full handle nobody knows still resolves over the network", async () => {
  // Not in follows, not in the thread — but real.
  const r = await resolvePerson("alice.bsky.social", [[], [], []]);
  assert.equal(r.did, "did:plc:alice");
});

// --- what must NOT resolve ---------------------------------------------------

test("a name the agent invented resolves to nobody", async () => {
  // The property that survives from the index-only design. This has to fail so
  // the Worker reports it instead of writing a record about the wrong person.
  assert.equal(await resolvePerson("totallymadeup", POOLS), null);
  assert.equal(await resolvePerson("notreal.bsky.social", POOLS), null);
});

test("an ambiguous shorthand resolves to nobody rather than guessing", async () => {
  // Two follows share a first label. Picking one would put a stranger on
  // someone's list; asking is the right move and the Worker's reply does that.
  const ambiguous = [
    { did: "did:plc:a", handle: "sam.bsky.social" },
    { did: "did:plc:b", handle: "sam.example.com" },
  ];
  assert.equal(await resolvePerson("sam", [ambiguous]), null);
});

test("an ambiguous display name resolves to nobody", async () => {
  const two = [
    { did: "did:plc:a", handle: "a.bsky.social", displayName: "Paul" },
    { did: "did:plc:b", handle: "b.bsky.social", displayName: "Paul" },
  ];
  assert.equal(await resolvePerson("Paul", [two]), null);
});

test("empty and junk input resolve to nobody", async () => {
  for (const junk of ["", "   ", "@", "@@@"]) {
    assert.equal(await resolvePerson(junk, POOLS), null, `should not resolve ${JSON.stringify(junk)}`);
  }
});

// --- precedence --------------------------------------------------------------

test("an exact handle beats a prefix match on someone else", async () => {
  const pools = [[
    { did: "did:plc:exact", handle: "bits.bsky.social" },
    { did: "did:plc:prefix", handle: "bits.example.com" },
  ]];
  const r = await resolvePerson("bits.bsky.social", pools);
  assert.equal(r.did, "did:plc:exact");
});

test("a handle beats a display name that collides with it", async () => {
  // Someone's display name is another person's handle. The handle is the more
  // specific claim.
  const pools = [[
    { did: "did:plc:handle", handle: "zed.bsky.social", displayName: "Something Else" },
    { did: "did:plc:name", handle: "other.bsky.social", displayName: "zed.bsky.social" },
  ]];
  const r = await resolvePerson("zed.bsky.social", pools);
  assert.equal(r.did, "did:plc:handle");
});

// --- the search path ---------------------------------------------------------
//
// Step 4 of the cascade: someone the tagger doesn't follow and didn't link, so
// the agent searched Bluesky and returned a handle from the results. Untested
// until now — every case that had been run resolved out of `follows`.
//
// From the Worker's side a searched handle is just a full handle: it resolves
// against the network or it doesn't. The judgement about WHICH search result to
// trust belongs to the agent and lives in the prompt, because the Worker can't
// tell a searched handle from a remembered one.

const STRANGER_NETWORK = {
  ...NETWORK,
  "samreich.bsky.social": "did:plc:samreich",
  "potterymouth.plate": "did:plc:pottery",
};

test("a handle found by search resolves even though it's in no pool", async () => {
  const r = await resolvePerson("samreich.bsky.social", POOLS, STRANGER_NETWORK);
  assert.equal(r.did, "did:plc:samreich");
  assert.equal(r.handle, "samreich.bsky.social");
});

test("a non-bsky.social domain handle resolves the same way", async () => {
  const r = await resolvePerson("potterymouth.plate", POOLS, STRANGER_NETWORK);
  assert.equal(r.did, "did:plc:pottery");
});

// The failure that matters. If the agent transcribes a searched handle slightly
// wrong, it must resolve to nobody rather than to someone else — the tagger
// gets "couldn't find them" and can retry, which is recoverable. Silently
// landing on a different account is not.
test("a mistyped handle resolves to nobody, not to someone else", async () => {
  assert.equal(await resolvePerson("samrich.bsky.social", POOLS, STRANGER_NETWORK), null);
  assert.equal(await resolvePerson("fleetingbit.bsky.social", POOLS, STRANGER_NETWORK), null);
});

// A bare first name is exactly what search is bad at, and the prompt tells the
// agent to ask rather than guess. The Worker's half of that: a bare name that
// matches nobody in the pools doesn't get resolved by a hopeful lookup.
test("a bare first name that's in no pool resolves to nobody", async () => {
  assert.equal(await resolvePerson("sam", POOLS, STRANGER_NETWORK), null);
});

// And the reason the prompt says to prefer follows over search: a name that IS
// in follows must not go to the network, or an unrelated stranger with a
// matching handle could win.
test("follows beats the network for the same shorthand", async () => {
  const r = await resolvePerson("fleetingbits", POOLS, {
    ...STRANGER_NETWORK,
    fleetingbits: "did:plc:someone-else",
  });
  assert.equal(r.did, "did:plc:fleeting");
});

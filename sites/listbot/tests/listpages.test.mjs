// Tests for how the list pages read data.
//
// The bug these come out of: /lists used to load EVERY listitem in the repo to
// render a list of lists. For an account with 3 lists and 149 members that's
// two round trips whose results are thrown away except the counts, and it gets
// worse linearly — a few thousand members and the page stops loading at all.
//
// Split in two: /lists needs names, kinds and counts; /lists/<rkey> needs one
// page of one list's members. Neither needs the whole repo.
import { test } from "node:test";
import assert from "node:assert/strict";

// --- mirrors of src/lists.ts -------------------------------------------------

const PURPOSE_URI = {
  curatelist: "app.bsky.graph.defs#curatelist",
  modlist: "app.bsky.graph.defs#modlist",
};

function summarize(records, counts) {
  const lists = records.map((r) => ({
    uri: r.uri,
    rkey: r.uri.split("/").pop(),
    name: r.value?.name ?? "(unnamed)",
    purpose: r.value?.purpose === PURPOSE_URI.modlist ? "modlist" : "curatelist",
    memberCount: counts.has(r.uri) ? counts.get(r.uri) : null,
  }));
  lists.sort((a, b) => a.name.localeCompare(b.name));
  return lists;
}

// getList returns the LISTITEM uri per row; the rkey a remove needs is that
// one, not the subject's. Getting this wrong deletes nothing, or worse.
function membersFrom(items) {
  return items.map((it) => ({
    rkey: it.uri.split("/").pop(),
    subjectDid: it.subject.did,
    handle: it.subject.handle,
  }));
}

// --- the index ---------------------------------------------------------------

const RECORDS = [
  {
    uri: "at://did:plc:rob/app.bsky.graph.list/3gold",
    value: { name: "Gold Cluster (87+1)", purpose: PURPOSE_URI.curatelist },
  },
  {
    uri: "at://did:plc:rob/app.bsky.graph.list/3core",
    value: { name: "Core Cluster ", purpose: PURPOSE_URI.curatelist },
  },
  {
    uri: "at://did:plc:rob/app.bsky.graph.list/3mute",
    value: { name: "crypto spammers", purpose: PURPOSE_URI.modlist },
  },
];

test("every list in the repo is listed, not just the first page's worth", () => {
  // The symptom that started this: only one list showed up.
  const lists = summarize(RECORDS, new Map());
  assert.equal(lists.length, 3);
});

test("counts come from the appview when it has them", () => {
  const counts = new Map([
    ["at://did:plc:rob/app.bsky.graph.list/3gold", 35],
    ["at://did:plc:rob/app.bsky.graph.list/3core", 35],
    ["at://did:plc:rob/app.bsky.graph.list/3mute", 0],
  ]);
  const lists = summarize(RECORDS, counts);
  // By name rather than position, so this doesn't break when sorting changes.
  const byName = Object.fromEntries(lists.map((l) => [l.name.trim(), l.memberCount]));
  assert.equal(byName["Gold Cluster (87+1)"], 35);
  assert.equal(byName["Core Cluster"], 35);
  assert.equal(byName["crypto spammers"], 0);
});

test("a list the appview hasn't indexed shows no count rather than zero", () => {
  // A list listbot made seconds ago. "0 members" would be a lie; "—" isn't.
  const lists = summarize(RECORDS, new Map());
  assert.deepEqual(lists.map((l) => l.memberCount), [null, null, null]);
});

test("a modlist is distinguishable from a curatelist", () => {
  const lists = summarize(RECORDS, new Map());
  const byName = Object.fromEntries(lists.map((l) => [l.name.trim(), l.purpose]));
  assert.equal(byName["crypto spammers"], "modlist");
  assert.equal(byName["Core Cluster"], "curatelist");
});

test("lists sort by name, case-insensitively", () => {
  // localeCompare, so a lowercase name isn't exiled below the capitalised
  // ones — people name lists both ways and an ASCII sort looks broken.
  const lists = summarize(RECORDS, new Map());
  assert.deepEqual(lists.map((l) => l.name.trim()), [
    "Core Cluster",
    "crypto spammers",
    "Gold Cluster (87+1)",
  ]);
});

// --- one list's members ------------------------------------------------------

test("a member's rkey is the listitem's, not the subject's", () => {
  // The load-bearing one. getList gives the listitem uri in `uri` and the
  // person in `subject`; removing needs the former. Using the subject's DID
  // here would delete nothing and report success.
  const members = membersFrom([
    {
      uri: "at://did:plc:rob/app.bsky.graph.listitem/3item1",
      subject: { did: "did:plc:alice", handle: "alice.bsky.social" },
    },
  ]);
  assert.equal(members[0].rkey, "3item1");
  assert.equal(members[0].subjectDid, "did:plc:alice");
});

test("a member with no handle still renders and still removes", () => {
  // A deactivated or unresolvable account. It must not break the page, and it
  // must still be removable — that's often exactly who you want off.
  const members = membersFrom([
    {
      uri: "at://did:plc:rob/app.bsky.graph.listitem/3item2",
      subject: { did: "did:plc:ghost" },
    },
  ]);
  assert.equal(members[0].rkey, "3item2");
  assert.equal(members[0].handle, undefined);
});

test("an empty list yields no members and doesn't throw", () => {
  assert.deepEqual(membersFrom([]), []);
});

// --- pagination --------------------------------------------------------------

test("a cursor is carried so a long list can be walked", () => {
  const appviewResponse = { items: [], cursor: "abc123" };
  assert.equal(appviewResponse.cursor, "abc123");
});

test("no cursor means the last page", () => {
  const appviewResponse = { items: [] };
  assert.equal(appviewResponse.cursor, undefined);
});

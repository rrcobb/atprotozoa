// Managing a list itself — delete, rename, change its kind.
//
// Rob asked the bot to delete a list and it said it couldn't. The UI could
// already do all three; the bot had no action for any of them, so it refused a
// thing listbot plainly knows how to do.
//
// The pattern these guard: the agent names a list, the Worker looks up the
// rkey. The agent never handles rkeys or URIs, so it can't act on a list by
// pointing at a record — only by naming one the tagger owns.
import { test } from "node:test";
import assert from "node:assert/strict";

const LISTS = [
  { name: "qt reads", rkey: "3qt", uri: "at://did:plc:rob/app.bsky.graph.list/3qt" },
  { name: "ai news knowers", rkey: "3ai", uri: "at://did:plc:rob/app.bsky.graph.list/3ai" },
  { name: "people I blocked", rkey: "3blk", uri: "at://did:plc:rob/app.bsky.graph.list/3blk" },
];

const normalize = (n) => n.trim().toLowerCase().replace(/\s+/g, " ");
const findListRkey = (name) => LISTS.find((l) => normalize(l.name) === normalize(name)) ?? null;

// --- looking up the list the agent named -------------------------------------

test("a named list resolves to its rkey", () => {
  assert.equal(findListRkey("qt reads").rkey, "3qt");
});

test("matching is case- and whitespace-insensitive, like adding is", () => {
  assert.equal(findListRkey("QT Reads").rkey, "3qt");
  assert.equal(findListRkey("  qt   reads  ").rkey, "3qt");
});

test("a list the tagger doesn't have resolves to nothing", () => {
  // Must not fall through to deleting something else.
  assert.equal(findListRkey("a list that isn't there"), null);
});

test("the agent can't point at a record, only name a list", () => {
  // Handing an at:// uri or an rkey as the name finds nothing, so an agent
  // that invented one can't reach a record with it.
  assert.equal(findListRkey("at://did:plc:rob/app.bsky.graph.list/3qt"), null);
  assert.equal(findListRkey("3qt"), null);
});

// --- replies -----------------------------------------------------------------

function composeOne(o) {
  if (o.action === "deleteList") return `deleted "${o.listName}"`;
  if (o.action === "renameList") {
    return o.previousName && o.previousName !== o.listName
      ? `renamed "${o.previousName}" to "${o.listName}"`
      : `renamed it to "${o.listName}"`;
  }
  if (o.action === "setPurpose") {
    return o.purpose === "modlist"
      ? `"${o.listName}" is a mute/block list now`
      : `"${o.listName}" is a curation list now`;
  }
  return "";
}

test("a delete says what went", () => {
  assert.equal(composeOne({ action: "deleteList", listName: "qt reads" }), 'deleted "qt reads"');
});

test("a rename names both, so it's clear what happened", () => {
  assert.equal(
    composeOne({ action: "renameList", previousName: "qt reads", listName: "quote tweets" }),
    'renamed "qt reads" to "quote tweets"',
  );
});

test("a purpose change says which kind it is now", () => {
  assert.equal(
    composeOne({ action: "setPurpose", listName: "spammers", purpose: "modlist" }),
    '"spammers" is a mute/block list now',
  );
  assert.equal(
    composeOne({ action: "setPurpose", listName: "ceramics", purpose: "curatelist" }),
    '"ceramics" is a curation list now',
  );
});

// --- the link ----------------------------------------------------------------

test("a deleted list isn't linked — the page is gone", () => {
  const outcomes = [
    { action: "deleteList", listName: "qt reads", listUri: "at://x/y/3qt" },
  ];
  const linkable = [...outcomes].reverse().find((o) => o.listUri && o.action !== "deleteList");
  assert.equal(linkable, undefined);
});

test("a rename IS linked — the list still exists under its new name", () => {
  const outcomes = [
    { action: "renameList", listName: "quote tweets", listUri: "at://x/y/3qt" },
  ];
  const linkable = [...outcomes].reverse().find((o) => o.listUri && o.action !== "deleteList");
  assert.equal(linkable.listUri, "at://x/y/3qt");
});

test("deleting one list and renaming another links the surviving one", () => {
  const outcomes = [
    { action: "deleteList", listName: "gone", listUri: "at://x/y/3gone" },
    { action: "renameList", listName: "kept", listUri: "at://x/y/3kept" },
  ];
  const linkable = [...outcomes].reverse().find((o) => o.listUri && o.action !== "deleteList");
  assert.equal(linkable.listUri, "at://x/y/3kept");
});

// Unit tests for the pure Void logic — the same module public/lib pages
// import as an ESM <script type="module">. Run with `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidPlace,
  validateRecord,
  graphemeLength,
  truncateGraphemes,
  scoreFromVotes,
  isHidden,
  isPruned,
  cooldownOk,
  isDuplicateRoot,
  carFilterCandidates,
  rkeyForShout,
  rkeyForCarry,
  rkeyForVote,
  homeFor,
  prefixFor,
  HIDE_THRESHOLD,
  ECHO_COOLDOWN_MS,
  SHOUT_MAX_GRAPHEMES,
} from "../public/lib/voidlogic.mjs";

const PLACE = { id: "tokyo", name: "Tokyo", emoji: "🗼", lat: 35.6762, lng: 139.6503 };

// ---- place / grapheme helpers ------------------------------------------------

test("isValidPlace accepts a real place", () => {
  assert.equal(isValidPlace(PLACE), true);
});
test("isValidPlace rejects out-of-range coordinates", () => {
  assert.equal(isValidPlace({ ...PLACE, lat: 200 }), false);
  assert.equal(isValidPlace({ ...PLACE, lng: -400 }), false);
});
test("isValidPlace rejects missing fields", () => {
  assert.equal(isValidPlace({ id: "x" }), false);
  assert.ok(!isValidPlace(null)); // short-circuits to the falsy input itself, not strictly `false`
});

test("graphemeLength counts emoji as one grapheme, not UTF-16 units", () => {
  assert.equal(graphemeLength("👨‍👩‍👧‍👦"), 1); // ZWJ family emoji
  assert.equal(graphemeLength("hi"), 2);
});
test("truncateGraphemes never splits a grapheme cluster", () => {
  const s = "a".repeat(5) + "👨‍👩‍👧‍👦".repeat(3);
  const t = truncateGraphemes(s, 6);
  assert.equal(graphemeLength(t), 6);
  assert.ok(!t.includes("�"));
});

// ---- record validation --------------------------------------------------------

test("validateRecord accepts a well-formed shout", () => {
  const r = validateRecord("net.bisks.void.shout", { text: "hello void", place: PLACE, createdAt: new Date().toISOString() });
  assert.equal(r.ok, true);
});
test("validateRecord rejects a shout over the grapheme cap", () => {
  const r = validateRecord("net.bisks.void.shout", {
    text: "x".repeat(SHOUT_MAX_GRAPHEMES + 1),
    place: PLACE,
    createdAt: new Date().toISOString(),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid-schema");
});
test("validateRecord rejects a shout with an invalid place", () => {
  const r = validateRecord("net.bisks.void.shout", { text: "hi", place: { id: "x" }, createdAt: new Date().toISOString() });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid-place");
});
test("validateRecord rejects a bad sourcePostUri", () => {
  const r = validateRecord("net.bisks.void.shout", {
    text: "hi",
    place: PLACE,
    sourcePostUri: "not-a-uri",
    createdAt: new Date().toISOString(),
  });
  assert.equal(r.ok, false);
});
test("validateRecord accepts a well-formed vote", () => {
  const r = validateRecord("net.bisks.void.vote", {
    subjectUri: "at://did:plc:abc123/net.bisks.void.shout/xyz",
    value: 1,
    createdAt: new Date().toISOString(),
  });
  assert.equal(r.ok, true);
});
test("validateRecord rejects a vote with value other than ±1", () => {
  const r = validateRecord("net.bisks.void.vote", {
    subjectUri: "at://did:plc:abc123/net.bisks.void.shout/xyz",
    value: 5,
    createdAt: new Date().toISOString(),
  });
  assert.equal(r.ok, false);
});
test("validateRecord rejects an unknown collection", () => {
  const r = validateRecord("net.bisks.void.nonsense", { createdAt: new Date().toISOString() });
  assert.equal(r.ok, false);
});

// ---- scoring / hide / prune ---------------------------------------------------

test("scoreFromVotes sums +1/-1 votes", () => {
  assert.equal(scoreFromVotes([{ value: 1 }, { value: 1 }, { value: -1 }]), 1);
});
test("isHidden matches the -5 threshold exactly", () => {
  assert.equal(isHidden(HIDE_THRESHOLD), true);
  assert.equal(isHidden(HIDE_THRESHOLD + 1), false);
});
test("isPruned is true once any ancestor is hidden", () => {
  const scoreByUri = new Map([["root", -5], ["child", 3]]);
  const root = { uri: "root", parent: null };
  const child = { uri: "child", parent: root };
  assert.equal(isPruned(child, scoreByUri), true);
  assert.equal(isPruned(root, scoreByUri), true);
});
test("isPruned is false when no ancestor is hidden", () => {
  const scoreByUri = new Map([["root", 3], ["child", 3]]);
  const root = { uri: "root", parent: null };
  const child = { uri: "child", parent: root };
  assert.equal(isPruned(child, scoreByUri), false);
});
test("isPruned survives a malformed cycle instead of looping forever", () => {
  const scoreByUri = new Map([["a", 0], ["b", 0]]);
  const a = { uri: "a" };
  const b = { uri: "b", parent: a };
  a.parent = b; // cycle
  assert.equal(isPruned(a, scoreByUri), false);
});

// ---- echo cooldown / duplicate-root --------------------------------------------

test("cooldownOk is true with no prior carry", () => {
  assert.equal(cooldownOk(undefined, Date.now()), true);
});
test("cooldownOk enforces the cooldown window", () => {
  const now = 1_000_000;
  assert.equal(cooldownOk(now - ECHO_COOLDOWN_MS + 1, now), false);
  assert.equal(cooldownOk(now - ECHO_COOLDOWN_MS, now), true);
});

test("isDuplicateRoot flags the same normalized text within the window", () => {
  const prior = [{ text: "  Hello   World  ", createdAtMs: 1_000_000 }];
  assert.equal(isDuplicateRoot(prior, "hello world", 1_000_000 + 60_000), true);
});
test("isDuplicateRoot ignores different text", () => {
  const prior = [{ text: "hello world", createdAtMs: 1_000_000 }];
  assert.equal(isDuplicateRoot(prior, "goodbye world", 1_000_000 + 1000), false);
});
test("isDuplicateRoot ignores the same text outside the window", () => {
  const prior = [{ text: "hello world", createdAtMs: 1_000_000 }];
  assert.equal(isDuplicateRoot(prior, "hello world", 1_000_000 + 10 * 60_000), false);
});

// ---- CAR import filters --------------------------------------------------------

test("carFilterCandidates excludes already-imported, replies, and too-short posts", () => {
  const posts = [
    { uri: "at://did/app.bsky.feed.post/1", text: "already imported" },
    { uri: "at://did/app.bsky.feed.post/2", text: "a reply", reply: { root: {}, parent: {} } },
    { uri: "at://did/app.bsky.feed.post/3", text: "hi" },
    { uri: "at://did/app.bsky.feed.post/4", text: "a real candidate post" },
  ];
  const already = new Set(["at://did/app.bsky.feed.post/1"]);
  const out = carFilterCandidates(posts, already, { minChars: 3 });
  assert.deepEqual(out.map((p) => p.uri), ["at://did/app.bsky.feed.post/4"]);
});
test("carFilterCandidates can include replies when asked", () => {
  const posts = [{ uri: "u1", text: "a reply worth keeping", reply: {} }];
  const out = carFilterCandidates(posts, new Set(), { excludeReplies: false });
  assert.equal(out.length, 1);
});

// ---- rkey determinism: retrying a dropped write must not duplicate ------------

test("rkeyForShout is deterministic — retrying within the same minute reuses the same rkey", async () => {
  const atMs = Date.parse("2026-08-14T10:00:15Z");
  const a = await rkeyForShout("did:plc:abc123", "hello void", "tokyo", atMs);
  const b = await rkeyForShout("did:plc:abc123", "hello void", "tokyo", atMs + 30_000); // same minute bucket
  assert.equal(a, b);
});
test("rkeyForShout changes across a minute boundary, so a deliberate repost later is a new record", async () => {
  const atMs = Date.parse("2026-08-14T10:00:59Z");
  const a = await rkeyForShout("did:plc:abc123", "hello void", "tokyo", atMs);
  const b = await rkeyForShout("did:plc:abc123", "hello void", "tokyo", atMs + 2000); // crosses into next minute
  assert.notEqual(a, b);
});
test("rkeyForShout differs by author, text, or place", async () => {
  const atMs = Date.parse("2026-08-14T10:00:00Z");
  const base = await rkeyForShout("did:plc:abc123", "hello void", "tokyo", atMs);
  assert.notEqual(base, await rkeyForShout("did:plc:xyz789", "hello void", "tokyo", atMs));
  assert.notEqual(base, await rkeyForShout("did:plc:abc123", "goodbye void", "tokyo", atMs));
  assert.notEqual(base, await rkeyForShout("did:plc:abc123", "hello void", "berlin", atMs));
});
test("rkeyForCarry is deterministic per (author, parent, place, minute) — a retried Echo doesn't duplicate", async () => {
  const atMs = Date.parse("2026-08-14T10:00:15Z");
  const a = await rkeyForCarry("net.bisks.void.echo", "did:plc:abc123", "at://did:plc:xyz/net.bisks.void.shout/r1", "tokyo", atMs);
  const b = await rkeyForCarry("net.bisks.void.echo", "did:plc:abc123", "at://did:plc:xyz/net.bisks.void.shout/r1", "tokyo", atMs + 1000);
  assert.equal(a, b);
});
test("rkeyForVote depends only on the subject — re-voting overwrites rather than duplicating", async () => {
  const subject = "at://did:plc:xyz/net.bisks.void.shout/r1";
  const a = await rkeyForVote(subject);
  const b = await rkeyForVote(subject);
  assert.equal(a, b);
  assert.notEqual(a, await rkeyForVote("at://did:plc:xyz/net.bisks.void.shout/r2"));
});

// ---- stable DID Homes / emoji names --------------------------------------------

test("homeFor is stable — the same DID always yields the same emoji + word", async () => {
  const did = "did:plc:abc123";
  const first = await homeFor(did);
  const second = await homeFor(did);
  assert.deepEqual(first, second);
  assert.ok(first.emoji.length > 0);
  assert.equal(first.name, `${first.emoji} ${first.word}`);
});
test("homeFor survives a handle change — it's derived from the DID, not any handle input", async () => {
  const did = "did:plc:abc123";
  const home = await homeFor(did);
  // homeFor takes only a DID; there is no handle parameter to vary, so the
  // same DID's Home cannot be perturbed by a handle change.
  assert.deepEqual(await homeFor(did), home);
});
test("homeFor differs across DIDs (not a constant fallback)", async () => {
  const a = await homeFor("did:plc:abc123");
  const b = await homeFor("did:plc:zzz999");
  assert.notEqual(a.name, b.name);
});
test("prefixFor is a stable, DID-derived, non-secret short code", async () => {
  const did = "did:plc:abc123";
  assert.equal(await prefixFor(did), await prefixFor(did));
  assert.notEqual(await prefixFor(did), await prefixFor("did:plc:zzz999"));
});

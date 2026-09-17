// Tests for the accumulation of labeled subjects.
//
// The invariant worth protecting: a post's `seenAt` never moves once set. It
// becomes the label's `cts`, which is part of the signed bytes, so a changing
// seenAt would re-sign the label to different bytes and invalidate whatever
// copy a consumer already holds. Sweeps overlap by design, so re-seeing the
// same post is the normal case, not the edge case.

import { test } from "node:test";
import assert from "node:assert";
import { mergeSubjects } from "../src/index.ts";

const found = (uri, cid = "cid1") => ({ uri, cid, sourceKey: "nyt", indexedAt: "2026-09-17T00:00:00Z" });

test("a new post is added", () => {
  const out = mergeSubjects([], [found("at://a/p/1")], 100);
  assert.equal(out.length, 1);
  assert.equal(out[0].uri, "at://a/p/1");
  assert.ok(out[0].seenAt);
});

test("re-seeing a post does not move its seenAt", () => {
  const existing = [{ uri: "at://a/p/1", cid: "cid1", sourceKey: "nyt", seenAt: "2020-01-01T00:00:00.000Z" }];
  const out = mergeSubjects(existing, [found("at://a/p/1")], 100);
  assert.equal(out.length, 1);
  assert.equal(out[0].seenAt, "2020-01-01T00:00:00.000Z");
});

test("re-seeing a post does not change its recorded cid", () => {
  // The label binds to the version of the record we first read. An edit gives
  // the post a new cid; the label should keep pointing at what it saw.
  const existing = [{ uri: "at://a/p/1", cid: "original", sourceKey: "nyt", seenAt: "2020-01-01T00:00:00.000Z" }];
  const out = mergeSubjects(existing, [found("at://a/p/1", "edited")], 100);
  assert.equal(out[0].cid, "original");
});

test("existing subjects survive a sweep that finds nothing", () => {
  const existing = [{ uri: "at://a/p/1", cid: "cid1", sourceKey: "nyt", seenAt: "2020-01-01T00:00:00.000Z" }];
  assert.deepEqual(mergeSubjects(existing, [], 100), existing);
});

test("the set is capped, dropping the oldest first", () => {
  const existing = [
    { uri: "at://a/p/old", cid: "c", sourceKey: "nyt", seenAt: "2020-01-01T00:00:00.000Z" },
    { uri: "at://a/p/mid", cid: "c", sourceKey: "nyt", seenAt: "2021-01-01T00:00:00.000Z" },
  ];
  const out = mergeSubjects(existing, [found("at://a/p/new")], 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((s) => s.uri), ["at://a/p/mid", "at://a/p/new"]);
});

test("a batch with duplicates adds the post once", () => {
  const out = mergeSubjects([], [found("at://a/p/1"), found("at://a/p/1")], 100);
  assert.equal(out.length, 1);
});

test("results come back oldest-first", () => {
  const existing = [
    { uri: "at://a/p/2", cid: "c", sourceKey: "nyt", seenAt: "2022-01-01T00:00:00.000Z" },
    { uri: "at://a/p/1", cid: "c", sourceKey: "nyt", seenAt: "2020-01-01T00:00:00.000Z" },
  ];
  const out = mergeSubjects(existing, [], 100);
  assert.deepEqual(out.map((s) => s.uri), ["at://a/p/1", "at://a/p/2"]);
});

// The opt-out list. /policy promises that asking gets you out, and that an
// account can be excluded permanently — so it's enforced on the read path,
// which means adding someone retracts the labels they already have rather than
// only preventing new ones.

import { applyOptOut } from "../src/index.ts";

const subj = (uri) => ({ uri, cid: "c", sourceKey: "nyt", seenAt: "2020-01-01T00:00:00.000Z" });
const none = { dids: new Set(), uris: new Set() };

test("with nothing opted out, everything passes through", () => {
  const subjects = [subj("at://did:plc:a/app.bsky.feed.post/1")];
  assert.deepEqual(applyOptOut(subjects, none), subjects);
});

test("a single opted-out post is dropped", () => {
  const subjects = [subj("at://did:plc:a/app.bsky.feed.post/1"), subj("at://did:plc:a/app.bsky.feed.post/2")];
  const out = applyOptOut(subjects, { dids: new Set(), uris: new Set(["at://did:plc:a/app.bsky.feed.post/1"]) });
  assert.deepEqual(out.map((s) => s.uri), ["at://did:plc:a/app.bsky.feed.post/2"]);
});

test("an opted-out account drops all of its posts", () => {
  const subjects = [
    subj("at://did:plc:a/app.bsky.feed.post/1"),
    subj("at://did:plc:a/app.bsky.feed.post/2"),
    subj("at://did:plc:b/app.bsky.feed.post/3"),
  ];
  const out = applyOptOut(subjects, { dids: new Set(["did:plc:a"]), uris: new Set() });
  assert.deepEqual(out.map((s) => s.uri), ["at://did:plc:b/app.bsky.feed.post/3"]);
});

test("opting out one account does not affect a similarly-named one", () => {
  const subjects = [subj("at://did:plc:abc/app.bsky.feed.post/1")];
  assert.equal(applyOptOut(subjects, { dids: new Set(["did:plc:ab"]), uris: new Set() }).length, 1);
});

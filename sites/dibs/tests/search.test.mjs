// Unit tests for the pure/mockable parts of search.js — the paging logic
// that findFirst() relies on to trust "the cursor came back empty" as proof
// there's nothing earlier, not just "we got tired of paging."
// Run with `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate, postTime, matchesPhrase, findFirst } from "../public/lib/search.js";

function post(iso, text) {
  return { record: { createdAt: iso, text: text ?? "" } };
}

// ---- normalizeDate / postTime -----------------------------------------------

test("normalizeDate truncates extra fractional-second digits", () => {
  assert.equal(normalizeDate("2026-08-21T10:00:00.08081300Z"), "2026-08-21T10:00:00.080Z");
});
test("normalizeDate leaves a normal timestamp alone", () => {
  assert.equal(normalizeDate("2026-08-21T10:00:00.123Z"), "2026-08-21T10:00:00.123Z");
});
test("normalizeDate passes through nullish input", () => {
  assert.equal(normalizeDate(undefined), undefined);
  assert.equal(normalizeDate(""), "");
});
test("postTime prefers record.createdAt over indexedAt", () => {
  const t = postTime({ record: { createdAt: "2026-08-21T10:00:00Z" }, indexedAt: "2026-08-21T12:00:00Z" });
  assert.equal(t.toISOString(), "2026-08-21T10:00:00.000Z");
});
test("postTime falls back to indexedAt when record.createdAt is missing", () => {
  const t = postTime({ indexedAt: "2026-08-21T12:00:00Z" });
  assert.equal(t.toISOString(), "2026-08-21T12:00:00.000Z");
});

// ---- matchesPhrase -----------------------------------------------------------
// searchPosts ranks by relevance, not literal containment (sites/patientzero
// hit this for real: a displayed "patient zero" didn't contain the phrase at
// all) — every hit has to survive a literal, case-insensitive substring check
// before it's trusted.

test("matchesPhrase accepts a literal, case-insensitive substring match", () => {
  assert.equal(matchesPhrase(post("2026-08-21T10:00:00Z", "everyone is saying ZORPTASTIC today"), "zorptastic"), true);
});
test("matchesPhrase rejects a post that never says the phrase", () => {
  assert.equal(matchesPhrase(post("2026-08-21T10:00:00Z", "just vibing, unrelated post"), "zorptastic"), false);
});
test("matchesPhrase rejects a post that only shares one word of a multi-word phrase", () => {
  assert.equal(matchesPhrase(post("2026-08-21T10:00:00Z", "the weird part is true"), "weird phrase"), false);
});
test("matchesPhrase treats a missing/empty post text as no match", () => {
  assert.equal(matchesPhrase({ record: {} }, "zorptastic"), false);
  assert.equal(matchesPhrase(null, "zorptastic"), false);
});

// ---- findFirst: the end-to-end paging logic ----------------------------------

let uriCounter = 0;
function fullPost(iso, text) {
  uriCounter++;
  return {
    uri: `at://did:example:alice/app.bsky.feed.post/${uriCounter}`,
    author: { did: "did:example:alice", handle: "alice.test" },
    record: { createdAt: iso, text },
  };
}

function mockFetchPages(pages) {
  let call = 0;
  return async () => {
    const body = pages[Math.min(call, pages.length - 1)];
    call++;
    return { ok: true, status: 200, json: async () => body };
  };
}

test("findFirst pages until the cursor is exhausted and returns the oldest literal match", async () => {
  const pages = [
    { posts: [fullPost("2026-08-21T12:00:00Z", "everyone is saying zorptastic today")], cursor: "c1" },
    { posts: [fullPost("2026-08-20T09:00:00Z", "zorptastic again")], cursor: "c2" },
    { posts: [fullPost("2026-08-01T00:00:00Z", "the very first zorptastic post")], cursor: undefined },
  ];
  const originalFetch = global.fetch;
  global.fetch = mockFetchPages(pages);
  try {
    const { first, count, exhausted } = await findFirst("zorptastic");
    assert.equal(exhausted, true);
    assert.equal(count, 3);
    assert.equal(first.record.text, "the very first zorptastic post");
  } finally {
    global.fetch = originalFetch;
  }
});

test("findFirst drops relevance-only hits that don't literally contain the phrase", async () => {
  const pages = [
    {
      posts: [
        fullPost("2026-08-21T12:00:00Z", "everyone is saying zorptastic today"),
        fullPost("2026-08-15T00:00:00Z", "just talking about zorp, unrelated"), // no literal match
      ],
      cursor: undefined,
    },
  ];
  const originalFetch = global.fetch;
  global.fetch = mockFetchPages(pages);
  try {
    const { first, count } = await findFirst("zorptastic");
    assert.equal(count, 1);
    assert.equal(first.record.text, "everyone is saying zorptastic today");
  } finally {
    global.fetch = originalFetch;
  }
});

test("findFirst reports first=null and exhausted=true when nobody has ever said the phrase", async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchPages([{ posts: [], cursor: undefined }]);
  try {
    const { first, count, exhausted } = await findFirst("zorptastic");
    assert.equal(first, null);
    assert.equal(count, 0);
    assert.equal(exhausted, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("findFirst stops on a 429 without crashing and reports exhausted=false", async () => {
  const originalFetch = global.fetch;
  let call = 0;
  global.fetch = async () => {
    call++;
    if (call === 1) {
      return { ok: true, status: 200, json: async () => ({ posts: [fullPost("2026-08-21T12:00:00Z", "zorptastic")], cursor: "c1" }) };
    }
    return { ok: false, status: 429, json: async () => ({}) };
  };
  try {
    const { first, exhausted } = await findFirst("zorptastic");
    assert.equal(exhausted, false);
    assert.equal(first.record.text, "zorptastic");
  } finally {
    global.fetch = originalFetch;
  }
});

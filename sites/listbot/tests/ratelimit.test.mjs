// Tests for the per-account tag budget.
//
// Every tag is a Sonnet run on a subscription, so a tag costs real capacity —
// the same capacity buildthis needs. This caps what one account can spend.
//
// It is NOT a safety control and the tests are written with that in mind: a
// tagger can only ever edit their own lists, so the failure being guarded
// against is "one user crowds out the builds", not "one user harms another".
// That's why a KV failure fails OPEN — a bot that stops working whenever KV
// hiccups is worse than one that briefly over-spends.
import { test } from "node:test";
import assert from "node:assert/strict";

// --- mirror of src/queue.ts --------------------------------------------------

function fakeKv(opts = {}) {
  return {
    store: new Map(),
    failReads: opts.failReads ?? false,
    failWrites: opts.failWrites ?? false,
    async get(key) {
      if (this.failReads) throw new Error("kv down");
      return this.store.get(key) ?? null;
    },
    async put(key, value) {
      if (this.failWrites) throw new Error("kv down");
      this.store.set(key, value);
    },
  };
}

async function checkRateLimit(kv, did, limit, windowMinutes, now = Date.now()) {
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `rate:${did}:${windowStart}`;
  const resetsInMin = Math.max(1, Math.ceil((windowStart + windowMs - now) / 60000));

  let used = 0;
  try {
    const raw = await kv.get(key);
    used = raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return { allowed: true, used: 0, limit, resetsInMin };
  }
  if (used >= limit) return { allowed: false, used, limit, resetsInMin };
  try {
    await kv.put(key, String(used + 1));
  } catch {}
  return { allowed: true, used: used + 1, limit, resetsInMin };
}

// --- the budget --------------------------------------------------------------

test("tags under the limit are allowed", async () => {
  const kv = fakeKv();
  for (let i = 1; i <= 5; i++) {
    const r = await checkRateLimit(kv, "did:plc:alice", 5, 60);
    assert.equal(r.allowed, true, `tag ${i} should be allowed`);
    assert.equal(r.used, i);
  }
});

test("the tag past the limit is refused", async () => {
  const kv = fakeKv();
  for (let i = 0; i < 5; i++) await checkRateLimit(kv, "did:plc:alice", 5, 60);
  const r = await checkRateLimit(kv, "did:plc:alice", 5, 60);
  assert.equal(r.allowed, false);
  assert.equal(r.used, 5);
});

test("one account's spending doesn't affect another's", async () => {
  const kv = fakeKv();
  for (let i = 0; i < 5; i++) await checkRateLimit(kv, "did:plc:alice", 5, 60);
  const bob = await checkRateLimit(kv, "did:plc:bob", 5, 60);
  assert.equal(bob.allowed, true);
  assert.equal(bob.used, 1);
});

test("a new window starts fresh", async () => {
  const kv = fakeKv();
  const t0 = 1_000_000_000_000;
  const windowMs = 60 * 60 * 1000;
  const start = Math.floor(t0 / windowMs) * windowMs;
  for (let i = 0; i < 5; i++) await checkRateLimit(kv, "did:plc:alice", 5, 60, start + 1000);
  const blocked = await checkRateLimit(kv, "did:plc:alice", 5, 60, start + 1000);
  assert.equal(blocked.allowed, false);
  // Next window over.
  const next = await checkRateLimit(kv, "did:plc:alice", 5, 60, start + windowMs + 1000);
  assert.equal(next.allowed, true);
  assert.equal(next.used, 1);
});

test("the reset time counts down within a window", async () => {
  const kv = fakeKv();
  const windowMs = 60 * 60 * 1000;
  const start = Math.floor(1_000_000_000_000 / windowMs) * windowMs;
  const early = await checkRateLimit(kv, "did:plc:alice", 5, 60, start + 60_000);
  const late = await checkRateLimit(kv, "did:plc:alice", 5, 60, start + windowMs - 60_000);
  assert.ok(early.resetsInMin > late.resetsInMin);
  assert.ok(late.resetsInMin >= 1, "never reports 0 minutes — 'try again in 0m' is nonsense");
});

// --- failure behavior --------------------------------------------------------

test("a KV read failure fails open, not closed", async () => {
  // Deliberate: this is a budget guard, not a safety one. A bot that stops
  // working whenever KV hiccups is worse than one that briefly over-spends.
  const kv = fakeKv({ failReads: true });
  const r = await checkRateLimit(kv, "did:plc:alice", 5, 60);
  assert.equal(r.allowed, true);
});

test("a KV write failure still allows the tag", async () => {
  const kv = fakeKv({ failWrites: true });
  const r = await checkRateLimit(kv, "did:plc:alice", 5, 60);
  assert.equal(r.allowed, true);
});

test("a corrupt counter reads as zero rather than wedging", async () => {
  const kv = fakeKv();
  const windowMs = 60 * 60 * 1000;
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  kv.store.set(`rate:did:plc:alice:${start}`, "not a number");
  const r = await checkRateLimit(kv, "did:plc:alice", 5, 60);
  assert.equal(r.allowed, true);
});

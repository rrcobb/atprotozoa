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

// --- backpressure on queue depth ---------------------------------------------
//
// The second limit, and deliberately NOT a headcount of signed-in accounts.
// Being signed in isn't load — it's a KV entry doing nothing — so a headcount
// would block 25 people who tag once a month while permitting one person
// tagging all day. Queue depth is the direct measure of falling behind.

function overQueueLimit(stats, maxDepth) {
  if (!maxDepth || maxDepth <= 0) return false;
  if (!stats) return false; // a failed read skips the check rather than blocking
  return stats.queued >= maxDepth;
}

test("an empty queue accepts tags", () => {
  assert.equal(overQueueLimit({ queued: 0 }, 25), false);
});

test("a queue under the limit accepts tags — a burst just goes slowly", () => {
  assert.equal(overQueueLimit({ queued: 24 }, 25), false);
});

test("a queue at the limit turns new tags away", () => {
  assert.equal(overQueueLimit({ queued: 25 }, 25), true);
});

test("a limit of 0 disables backpressure", () => {
  assert.equal(overQueueLimit({ queued: 9999 }, 0), false);
});

test("a failed queue read skips the check rather than blocking", () => {
  // Same posture as the rate limit: this smooths load, it isn't a boundary.
  assert.equal(overQueueLimit(null, 25), false);
});

test("claimed jobs don't count toward the limit, only waiting ones", () => {
  // A job the box is working on isn't backlog — it's progress. Counting it
  // would trip backpressure on a queue that's actually draining fine.
  assert.equal(overQueueLimit({ queued: 2, claimed: 1 }, 25), false);
});

// --- build priority ----------------------------------------------------------
//
// Mirrors box-poll.sh: at most one job claimed per pass, queues tried in order
// with buildthis first. The property that matters is that a steady stream of
// builds starves listbot rather than the other way round.

function onePassClaims(queues) {
  // queues: [{name, hasJob}] in priority order. Returns what the pass claimed.
  for (const q of queues) {
    if (q.hasJob) return q.name;
  }
  return null;
}

test("a build is claimed before a listbot job in the same pass", () => {
  const claimed = onePassClaims([
    { name: "buildthis", hasJob: true },
    { name: "listbot", hasJob: true },
  ]);
  assert.equal(claimed, "buildthis");
});

test("listbot is served when no build is waiting", () => {
  const claimed = onePassClaims([
    { name: "buildthis", hasJob: false },
    { name: "listbot", hasJob: true },
  ]);
  assert.equal(claimed, "listbot");
});

test("a steady stream of builds starves listbot, not the reverse", () => {
  // Ten passes with a build always waiting: listbot never gets claimed, which
  // is the intended priority — listbot is the dumber, lighter bot.
  const claims = [];
  for (let i = 0; i < 10; i++) {
    claims.push(onePassClaims([
      { name: "buildthis", hasJob: true },
      { name: "listbot", hasJob: true },
    ]));
  }
  assert.deepEqual(new Set(claims), new Set(["buildthis"]));
});

test("an empty pass claims nothing", () => {
  assert.equal(
    onePassClaims([
      { name: "buildthis", hasJob: false },
      { name: "listbot", hasJob: false },
    ]),
    null,
  );
});

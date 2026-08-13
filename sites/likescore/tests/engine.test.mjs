// Engine-level tests: the scan pipeline, persistence, and prestige recompute
// as a whole, running against a real (in-memory) SQLite database via Node's
// built-in node:sqlite — same exec(query, ...bindings)/.toArray() shape the
// Durable Object's storage.sql gives src/engine.ts, so LikeScoreEngine runs
// completely unmodified. The AppView is mocked via a global `fetch` stub (no
// real network) so these stay fast and deterministic while covering exactly
// what tests/formulas.test.mjs's closing comment says isn't tested there:
// partial scans, provisional promotion, caching and graph expansion. Run
// with `node --test tests/*.test.mjs` (see ../package.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { LikeScoreEngine } from "../src/engine.ts";
import { CONSTANTS } from "../src/formulas.ts";

// ---- fake Durable Object storage, backed by real SQLite ---------------------
function makeFakeState() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(query, ...bindings) {
      const isSelect = query.trim().toUpperCase().startsWith("SELECT");
      // A parameterless SELECT (e.g. `SELECT * FROM accounts`) must still go
      // through prepare().all() — db.exec() runs statements without
      // returning rows, so routing zero-binding calls through it here would
      // make every no-argument SELECT silently come back empty.
      if (!isSelect && bindings.length === 0) {
        db.exec(query);
        return { toArray: () => [] };
      }
      const stmt = db.prepare(query);
      if (isSelect) {
        return { toArray: () => stmt.all(...bindings) };
      }
      stmt.run(...bindings);
      return { toArray: () => [] };
    },
  };
  return {
    storage: { sql },
    async blockConcurrencyWhile(fn) {
      return fn();
    },
  };
}

// ---- mock AppView --------------------------------------------------------------
// A fresh registry per test; installed as globalThis.fetch. Handles/DIDs are
// looked up by exact string match against the querystring params bsky.ts
// sends, which keeps this a faithful (if minimal) stand-in for
// public.api.bsky.app.
// did:plc DIDs are base32-sortable: [a-z2-7] only ('0'/'1'/'8'/'9' are not
// valid digits there), so a raw decimal digit like the "1" in "ratesub1"
// would make an invalid DID and get silently dropped by isValidDid() during
// ingestion — remap the four disallowed digits to distinct unused letters
// (each test's labels only vary in their numeric suffix, so this stays
// collision-free) rather than lossily collapsing them to one placeholder.
const DIGIT_REMAP = { 0: "o", 1: "i", 8: "t", 9: "u" };
function did(label) {
  const safe = label
    .toLowerCase()
    .replace(/[0189]/g, (d) => DIGIT_REMAP[d]);
  return "did:plc:" + (safe + "2".repeat(24)).slice(0, 24);
}

function makeMockAppView() {
  const handleToDid = new Map();
  const profiles = new Map(); // did -> {handle, displayName, avatar, deactivated}
  const posts = new Map(); // did -> [{uri, cid, createdAt}]
  const likes = new Map(); // postUri -> [{did, handle, displayName, avatar, createdAt}] | {fail: status}
  const calls = { resolveHandle: 0, getProfile: 0, getAuthorFeed: 0, getLikes: 0 };

  function account(label, opts = {}) {
    const d = did(label);
    const handle = `${label}.test`;
    handleToDid.set(handle, d);
    profiles.set(d, {
      handle,
      displayName: opts.displayName,
      avatar: opts.avatar,
      deactivated: !!opts.deactivated,
    });
    posts.set(d, []);
    return d;
  }

  function addPost(subjectDid, postId, likers = []) {
    const uri = `at://${subjectDid}/app.bsky.feed.post/${postId}`;
    const cid = `cid-${postId}`;
    posts.get(subjectDid).push({ uri, cid, createdAt: new Date().toISOString() });
    likes.set(
      uri,
      likers.map((l, i) => ({
        did: l.did,
        handle: l.handle,
        displayName: l.displayName,
        createdAt: l.createdAt || new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      }))
    );
    return uri;
  }

  function failLikesFor(uri, status = 400) {
    likes.set(uri, { fail: status });
  }

  async function fetch(url) {
    const u = new URL(url);
    if (u.pathname.endsWith("resolveHandle")) {
      calls.resolveHandle++;
      const handle = u.searchParams.get("handle");
      const d = handleToDid.get(handle);
      if (!d) return jsonResponse({ message: "not found" }, 400);
      return jsonResponse({ did: d });
    }
    if (u.pathname.endsWith("getProfile")) {
      calls.getProfile++;
      const actor = u.searchParams.get("actor");
      const d = actor.startsWith("did:") ? actor : handleToDid.get(actor);
      const p = d && profiles.get(d);
      if (!p) return jsonResponse({ message: "profile not found" }, 400);
      if (p.deactivated) return jsonResponse({ message: "Account is deactivated" }, 400);
      return jsonResponse({ did: d, handle: p.handle, displayName: p.displayName, avatar: p.avatar });
    }
    if (u.pathname.endsWith("getAuthorFeed")) {
      calls.getAuthorFeed++;
      const actor = u.searchParams.get("actor");
      const list = posts.get(actor) || [];
      return jsonResponse({
        feed: list.map((p) => ({ post: { uri: p.uri, cid: p.cid, record: { createdAt: p.createdAt } } })),
      });
    }
    if (u.pathname.endsWith("getLikes")) {
      calls.getLikes++;
      const uri = u.searchParams.get("uri");
      const entry = likes.get(uri) || [];
      if (!Array.isArray(entry)) return jsonResponse({ message: "post unavailable" }, entry.fail);
      return jsonResponse({
        likes: entry.map((l) => ({ actor: { did: l.did, handle: l.handle, displayName: l.displayName }, createdAt: l.createdAt }),),
      });
    }
    return jsonResponse({ message: `unhandled mock url ${url}` }, 404);
  }

  return { account, addPost, failLikesFor, fetch, calls };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function collectEvents(response) {
  const events = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) events.push({ event, data: JSON.parse(data) });
    }
  }
  return events;
}

function scanRequest(subject, opts = {}) {
  return new Request("https://likescore.bisks.net/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": opts.ip || "1.2.3.4" },
    body: JSON.stringify({ subject, force: !!opts.force }),
  });
}

async function runScan(engine, subject, opts) {
  const resp = await engine.fetch(scanRequest(subject, opts));
  return collectEvents(resp);
}

async function getAccount(engine, subject) {
  const resp = await engine.fetch(
    new Request(`https://likescore.bisks.net/api/account?subject=${encodeURIComponent(subject)}`)
  );
  return resp.json();
}

// ---- tests ---------------------------------------------------------------------
test("provisional promotion: a liker discovered as provisional is promoted to scanned once scanned itself", async () => {
  const mock = makeMockAppView();
  const bob = mock.account("bob");
  const carol = mock.account("carol");
  mock.addPost(bob, "1", [{ did: carol, handle: "carol.test" }]);
  mock.addPost(carol, "1", []);
  globalThis.fetch = mock.fetch;

  const engine = new LikeScoreEngine(makeFakeState());
  await runScan(engine, "bob.test");

  const afterFirstScan = await getAccount(engine, "carol.test");
  assert.equal(afterFirstScan.account.status, "provisional");

  await runScan(engine, "carol.test");
  const afterOwnScan = await getAccount(engine, "carol.test");
  assert.equal(afterOwnScan.account.status, "scanned");
});

test("partial scan: an unreadable post (deleted/blocked) is skipped, not fatal, and marks the scan partial", async () => {
  const mock = makeMockAppView();
  const dana = mock.account("dana");
  const erin = mock.account("erin");
  mock.addPost(dana, "1", [{ did: erin, handle: "erin.test" }]);
  const deadUri = mock.addPost(dana, "2", [{ did: erin, handle: "erin.test" }]);
  mock.failLikesFor(deadUri, 400); // simulates a deleted post / unreadable record
  globalThis.fetch = mock.fetch;

  const engine = new LikeScoreEngine(makeFakeState());
  const events = await runScan(engine, "dana.test");
  const done = events.find((e) => e.event === "done");
  assert.equal(done.data.status, "partial");
  assert.equal(done.data.skippedPosts, 1);

  // the readable post's like still landed as a real edge, so the scan wasn't
  // wiped out by the one bad post — "never erase the last valid graph after
  // failure" holds even for a same-scan partial failure.
  const acct = await getAccount(engine, "erin.test");
  assert.equal(acct.likes.length, 1);
});

test("caching: rescanning within the cooldown returns a cached result and does not re-walk posts/likes", async () => {
  const mock = makeMockAppView();
  const finn = mock.account("finn");
  const gwen = mock.account("gwen");
  mock.addPost(finn, "1", [{ did: gwen, handle: "gwen.test" }]);
  globalThis.fetch = mock.fetch;

  const engine = new LikeScoreEngine(makeFakeState());
  await runScan(engine, "finn.test");
  const feedCallsAfterFirst = mock.calls.getAuthorFeed;

  const events = await runScan(engine, "finn.test"); // no force -> within cooldown
  assert.ok(events.some((e) => e.event === "cached"));
  assert.equal(events.some((e) => e.event === "done"), false);
  assert.equal(mock.calls.getAuthorFeed, feedCallsAfterFirst); // no new post walk

  // force=true bypasses the cooldown and does a real rescan
  const forced = await runScan(engine, "finn.test", { force: true });
  assert.ok(forced.some((e) => e.event === "done"));
  assert.equal(mock.calls.getAuthorFeed, feedCallsAfterFirst + 1);
});

test("anonymous rate limit: an IP is blocked after IP_SCANS_PER_HOUR scans", async () => {
  const mock = makeMockAppView();
  const subjects = [];
  for (let i = 0; i < CONSTANTS.IP_SCANS_PER_HOUR + 1; i++) {
    subjects.push(mock.account(`ratesub${i}`));
  }
  globalThis.fetch = mock.fetch;
  const engine = new LikeScoreEngine(makeFakeState());

  for (let i = 0; i < CONSTANTS.IP_SCANS_PER_HOUR; i++) {
    const events = await runScan(engine, `ratesub${i}.test`, { ip: "9.9.9.9" });
    assert.ok(events.some((e) => e.event === "done"), `scan ${i} should succeed`);
  }
  const blocked = await runScan(engine, `ratesub${CONSTANTS.IP_SCANS_PER_HOUR}.test`, { ip: "9.9.9.9" });
  const err = blocked.find((e) => e.event === "error");
  assert.ok(err && /rate limited/i.test(err.data.message));

  // a different IP is unaffected
  const otherIp = await runScan(engine, `ratesub${CONSTANTS.IP_SCANS_PER_HOUR}.test`, { ip: "1.1.1.1" });
  assert.ok(otherIp.some((e) => e.event === "done"));
});

test("deactivated accounts are recorded without a post walk and don't break prestige recompute", async () => {
  const mock = makeMockAppView();
  mock.account("husk", { deactivated: true });
  globalThis.fetch = mock.fetch;
  const engine = new LikeScoreEngine(makeFakeState());

  const events = await runScan(engine, "husk.test");
  const done = events.find((e) => e.event === "done");
  assert.equal(done.data.status, "deactivated");
  assert.equal(mock.calls.getAuthorFeed, 0);

  const acct = await getAccount(engine, "husk.test");
  assert.equal(acct.account.status, "deactivated");
  assert.equal(typeof acct.account.score, "number");
});

test("graph expansion: scanning a new account can raise an already-scanned account's score", async () => {
  const mock = makeMockAppView();
  const iris = mock.account("iris");
  const jack = mock.account("jack"); // likes iris, will later become highly-prestiged himself
  mock.addPost(iris, "1", [{ did: jack, handle: "jack.test" }]);
  mock.addPost(jack, "1", []);
  globalThis.fetch = mock.fetch;

  const engine = new LikeScoreEngine(makeFakeState());
  await runScan(engine, "iris.test");
  await runScan(engine, "jack.test");
  const before = (await getAccount(engine, "iris.test")).account.score;

  // Expand the graph: several new accounts repeatedly like jack, raising
  // jack's own prestige — which should feed back into iris's score on the
  // next full recompute, even though iris herself wasn't rescanned.
  const boosters = ["k1", "k2", "k3", "k4"].map((l) => mock.account(l));
  const jackUri2 = mock.addPost(
    jack,
    "2",
    boosters.map((b, i) => ({ did: b, handle: `${["k1", "k2", "k3", "k4"][i]}.test` }))
  );
  for (const b of boosters) mock.addPost(b, "1", []);
  void jackUri2;

  await runScan(engine, "jack.test", { force: true });
  const after = (await getAccount(engine, "iris.test")).account.score;

  assert.notEqual(before, after);
  assert.ok(after > before);
});

test("self-likes are excluded from the graph (no self-loop edge)", async () => {
  const mock = makeMockAppView();
  const lena = mock.account("lena");
  mock.addPost(lena, "1", [{ did: lena, handle: "lena.test" }, { did: mock.account("morgan"), handle: "morgan.test" }]);
  globalThis.fetch = mock.fetch;
  const engine = new LikeScoreEngine(makeFakeState());

  await runScan(engine, "lena.test");
  const acct = await getAccount(engine, "lena.test");
  assert.equal(acct.likedBy.length, 1);
  assert.equal(acct.likedBy[0].handle, "morgan.test");
});

test("an invalid scan subject is rejected before touching the network", async () => {
  const mock = makeMockAppView();
  globalThis.fetch = mock.fetch;
  const engine = new LikeScoreEngine(makeFakeState());

  const events = await runScan(engine, "not a valid subject!!");
  assert.ok(events.some((e) => e.event === "error"));
  assert.equal(mock.calls.resolveHandle, 0);
  assert.equal(mock.calls.getProfile, 0);
});

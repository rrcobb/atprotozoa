// sc-client.js — Social Credit's score/leaderboard/cooldown engine, run in
// every visitor's own browser. There used to be a CreditBoard Durable Object
// watching Jetstream and answering /api/*; that binding was removed
// 2026-08-14 (repo-wide "move experiment state to frontend and KV" cleanup,
// following the house rule against Durable Objects) and nothing replaced it,
// which is why the leaderboard, profile pages and voting all broke — every
// /api/* call here just 404s off the static asset router now.
//
// This reimplements the same rules client-side, same shape as
// sites/voidshout's ingest.js + store.js: a live Jetstream subscription for
// anything cast from now on, resumable across sessions via a cursor
// persisted in IndexedDB (sc-store.js). 2026-08-26: paired with
// global-backfill.js, which walks every repo that has ever written a
// net.bisks.socialcredit.vote record (via listReposByCollection + a full
// repo CAR download per voter — see that file) and folds the whole network's
// history in, not just BACKFILL_MS of it. A fresh visitor's board now
// converges on the network's real history instead of depending on how long
// they've had the page open; only "socialcredit +1/-1" reply-votes cast
// before a visitor's live session remain invisible, since those aren't
// records in the bulk-backfillable collection (see global-backfill.js's
// header comment). Every accepted vote is still a real, honestly-enforced
// vote: self-votes and cooldown-violating votes are evaluated the same way
// here as the old DO evaluated them, just replayed independently by whoever's
// watching instead of centrally.
//
// Votes can now arrive out of chronological order (live events interleaved
// with historical backfill from many repos at once), so acceptance can't be
// decided incrementally as each candidate shows up — a candidate accepted
// against a "last vote" that turns out to have an even older candidate
// arrive later would be wrong. Instead every raw candidate (whether it will
// ultimately be accepted or not) is kept in `rawByUri`, and the accepted
// `votes` list is rebuilt by sorting all of them by createdAt and replaying
// the self-vote/cooldown rule in one pass (`recompute`) — always correct
// regardless of arrival order, at the cost of an O(n log n) resort per
// batch, which is cheap at this site's scale.

import * as store from "./sc-store.js";
import { GlobalBackfill } from "./global-backfill.js";

const JETSTREAM_HOSTS = [
  "jetstream1.us-east.bsky.network",
  "jetstream2.us-east.bsky.network",
  "jetstream1.us-west.bsky.network",
  "jetstream2.us-west.bsky.network",
];
const VOTE_COLLECTION = "net.bisks.socialcredit.vote";
const HOUR_MS = 3600 * 1000;
const BACKFILL_MS = 48 * 3600 * 1000; // how far back Jetstream itself starts on a first-ever visit — a head start for reply-votes and very recent writes; global-backfill.js covers the record collection's full history separately
const PUB = "https://api.bsky.app/xrpc";
const REPLY_VOTE_RE = /^\s*socialcredit\s*([+-]\s*1)\s*$/i;

let votes = []; // accepted votes only, oldest first — rebuilt by recompute(), never mutated directly
const rawByUri = new Map(); // every candidate ever seen (accepted or not), keyed by uri — the source of truth
let lastAcceptedAt = new Map(); // `${voterDid}|${targetDid}` -> createdAtMs of the last accepted vote, rebuilt each recompute()

let started = null;
let socket = null;
let hostIdx = 0;
let cursorUs = null;
let closed = false;
let reconnectDelay = 1000;
let globalBackfill = null;

function pairKey(voterDid, targetDid) {
  return `${voterDid}|${targetDid}`;
}

function didFromUri(uri) {
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

function jetstreamUrl(host, cursor) {
  const wanted = [
    `wantedCollections=${encodeURIComponent(VOTE_COLLECTION)}`,
    `wantedCollections=${encodeURIComponent("app.bsky.feed.post")}`,
  ].join("&");
  const c = cursor != null ? `&cursor=${cursor}` : "";
  return `wss://${host}/subscribe?${wanted}${c}`;
}

function fromVoteRecord(evt) {
  const r = evt.commit.record;
  if (!r || typeof r.target !== "string" || Math.abs(r.delta) !== 1) return null;
  const createdAtMs = Date.parse(r.createdAt);
  return {
    uri: `at://${evt.did}/${VOTE_COLLECTION}/${evt.commit.rkey}`,
    voterDid: evt.did,
    targetDid: r.target,
    delta: r.delta,
    reason: typeof r.reason === "string" ? r.reason.slice(0, 280) : "",
    postUrl: typeof r.postUrl === "string" ? r.postUrl : "",
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    source: "record",
  };
}

// A reply saying "socialcredit +1"/"-1" counts as the same vote, no sign-in
// needed — the voter is the reply's author, the target is the DID the reply
// is replying to (has to be someone else's post, or it's a self-vote below).
function fromReplyPost(evt) {
  const r = evt.commit.record;
  if (!r || typeof r.text !== "string" || !r.reply || !r.reply.parent || !r.reply.parent.uri) return null;
  const m = REPLY_VOTE_RE.exec(r.text);
  if (!m) return null;
  const delta = m[1].replace(/\s+/g, "").startsWith("-") ? -1 : 1;
  const targetDid = didFromUri(r.reply.parent.uri);
  if (!targetDid) return null;
  const createdAtMs = Date.parse(r.createdAt);
  return {
    uri: `at://${evt.did}/app.bsky.feed.post/${evt.commit.rkey}`,
    voterDid: evt.did,
    targetDid,
    delta,
    reason: "",
    postUrl: `https://bsky.app/profile/${evt.did}/post/${evt.commit.rkey}`,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    source: "reply",
  };
}

// Records a candidate (from Jetstream or the global CAR backfill) as seen,
// regardless of whether it'll turn out to be accepted — self-votes are the
// one exception, never worth keeping since the rule can't change later.
// Returns true if this is a genuinely new candidate (caller should recompute).
function addRaw(candidate) {
  if (!candidate || rawByUri.has(candidate.uri)) return false;
  if (candidate.voterDid === candidate.targetDid) return false;
  rawByUri.set(candidate.uri, candidate);
  store.putVote(candidate).catch(() => {});
  return true;
}

// Same rules the CreditBoard DO used to enforce: no self-voting (handled in
// addRaw above), one vote per (voter, target) pair per hour. Rebuilds `votes`
// and `lastAcceptedAt` from scratch by replaying every known candidate in
// createdAt order — see the file header for why this can't be decided
// incrementally as each candidate arrives. A rule-breaking write still lands
// in the voter's own repo (the relay already verified it) — it's just never
// counted, silently, same as before.
function recompute() {
  const sorted = Array.from(rawByUri.values()).sort(
    (a, b) => a.createdAtMs - b.createdAtMs || (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0),
  );
  const accepted = [];
  const lastAt = new Map();
  for (const c of sorted) {
    const key = pairKey(c.voterDid, c.targetDid);
    const prev = lastAt.get(key);
    if (prev !== undefined && c.createdAtMs - prev < HOUR_MS) continue;
    lastAt.set(key, c.createdAtMs);
    accepted.push(c);
  }
  votes = accepted;
  lastAcceptedAt = lastAt;
}

function handleMessage(raw) {
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return;
  }
  if (evt.kind !== "commit" || !evt.commit || evt.commit.operation !== "create") return;
  if (typeof evt.time_us === "number") cursorUs = evt.time_us;
  let candidate = null;
  if (evt.commit.collection === VOTE_COLLECTION) candidate = fromVoteRecord(evt);
  else if (evt.commit.collection === "app.bsky.feed.post") candidate = fromReplyPost(evt);
  if (addRaw(candidate)) recompute();
}

async function connect() {
  if (closed) return;
  if (cursorUs == null) {
    cursorUs = await store.getMeta("cursorUs");
    if (cursorUs == null) cursorUs = (Date.now() - BACKFILL_MS) * 1000;
  }
  const host = JETSTREAM_HOSTS[hostIdx % JETSTREAM_HOSTS.length];
  socket = new WebSocket(jetstreamUrl(host, cursorUs));
  socket.onopen = () => {
    reconnectDelay = 1000;
  };
  socket.onmessage = (e) => handleMessage(e.data);
  socket.onclose = () => {
    if (closed) return;
    if (cursorUs != null) store.setMeta("cursorUs", cursorUs).catch(() => {});
    hostIdx++;
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
  };
  socket.onerror = () => {
    try {
      socket.close();
    } catch {}
  };
}

async function init() {
  started = Date.now();
  const stored = await store.allVotes();
  for (const v of stored) rawByUri.set(v.uri, v);
  recompute();
  connect();

  globalBackfill = new GlobalBackfill({
    onVote: (v) => addRaw(v),
    onProgress: () => recompute(),
  });
  globalBackfill.start();
}
const ready = init();

// --- profile resolution ----------------------------------------------------

const profileCache = new Map(); // did -> { handle, displayName, avatar }

async function fetchProfileBatch(batch) {
  try {
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    batch.forEach((d) => u.searchParams.append("actors", d));
    const r = await fetch(u);
    if (r.ok) {
      const data = await r.json();
      for (const p of data.profiles || []) {
        profileCache.set(p.did, { handle: p.handle, displayName: p.displayName || p.handle, avatar: p.avatar || "" });
      }
    }
  } catch {
    // fall through to the did-as-handle fallback below
  }
  for (const d of batch) {
    if (!profileCache.has(d)) profileCache.set(d, { handle: d, displayName: d, avatar: "" });
  }
}

async function ensureProfilesLoaded(dids) {
  const need = [...new Set(dids)].filter((d) => d && !profileCache.has(d));
  if (!need.length) return;
  const batches = [];
  for (let i = 0; i < need.length; i += 25) batches.push(need.slice(i, i + 25));
  await Promise.all(batches.map(fetchProfileBatch));
}

export function profileFor(did) {
  return profileCache.get(did) || { handle: did, displayName: did, avatar: "" };
}

async function hydrateProfiles(rows) {
  await ensureProfilesLoaded(rows.map((r) => r.did));
  return rows.map((r) => ({ ...r, ...profileFor(r.did) }));
}

// --- public query API --------------------------------------------------------

export async function meta() {
  await ready;
  return {
    trackingStartedAt: started,
    backfilledFrom: cursorUs != null ? Math.floor(cursorUs / 1000) : null,
    totalVotes: votes.length,
    connected: !!(socket && socket.readyState === 1),
    globalBackfill: globalBackfill ? globalBackfill.status() : null,
  };
}

const WINDOW_MS = { "1h": HOUR_MS, "24h": 24 * HOUR_MS, "7d": 7 * 24 * HOUR_MS, "30d": 30 * 24 * HOUR_MS };

export async function board({ sort = "top", window = "24h", limit = 100, query = "" } = {}) {
  await ready;
  const score = new Map();
  const received = new Map();
  for (const v of votes) {
    score.set(v.targetDid, (score.get(v.targetDid) || 0) + v.delta);
    received.set(v.targetDid, (received.get(v.targetDid) || 0) + 1);
  }

  let rows;
  if (sort === "gainers" || sort === "losers") {
    const windowMs = window === "all" ? null : WINDOW_MS[window] || WINDOW_MS["24h"];
    const from = windowMs == null ? started : Date.now() - windowMs;
    const delta = new Map();
    for (const v of votes) {
      if (v.createdAtMs < from) continue;
      delta.set(v.targetDid, (delta.get(v.targetDid) || 0) + v.delta);
    }
    rows = [...delta.entries()]
      .map(([did, windowDelta]) => ({ did, windowDelta, score: score.get(did) || 0 }))
      .filter((r) => (sort === "gainers" ? r.windowDelta > 0 : r.windowDelta < 0))
      .sort((a, b) => (sort === "gainers" ? b.windowDelta - a.windowDelta : a.windowDelta - b.windowDelta));
  } else if (sort === "voted") {
    rows = [...received.entries()]
      .map(([did, votesReceived]) => ({ did, votesReceived, score: score.get(did) || 0 }))
      .sort((a, b) => b.votesReceived - a.votesReceived);
  } else {
    rows = [...score.entries()]
      .map(([did, s]) => ({ did, score: s }))
      .sort((a, b) => (sort === "bottom" ? a.score - b.score : b.score - a.score));
  }
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  let out = await hydrateProfiles(rows);
  if (query) {
    const q = query.toLowerCase();
    out = out.filter((r) => r.handle.toLowerCase().includes(q) || (r.displayName || "").toLowerCase().includes(q));
  }
  return out.slice(0, limit);
}

export async function activity({ limit = 100, voter = null, target = null, query = "" } = {}) {
  await ready;
  let rows = votes.filter((v) => (!voter || v.voterDid === voter) && (!target || v.targetDid === target));
  rows = [...rows].sort((a, b) => b.createdAtMs - a.createdAtMs);
  await ensureProfilesLoaded(rows.flatMap((v) => [v.voterDid, v.targetDid]));
  let out = rows.map((v) => {
    const vp = profileFor(v.voterDid);
    const tp = profileFor(v.targetDid);
    return {
      voterDid: v.voterDid,
      targetDid: v.targetDid,
      voterHandle: vp.handle,
      targetHandle: tp.handle,
      delta: v.delta,
      reason: v.reason,
      postUrl: v.postUrl,
      createdAt: v.createdAtMs,
    };
  });
  if (query) {
    const q = query.toLowerCase();
    out = out.filter((v) => v.voterHandle.toLowerCase().includes(q) || v.targetHandle.toLowerCase().includes(q));
  }
  return out.slice(0, limit);
}

export async function scoreFor(did) {
  await ready;
  let s = 0;
  for (const v of votes) if (v.targetDid === did) s += v.delta;
  return s;
}

export async function cooldownRemaining(voterDid, targetDid) {
  await ready;
  if (!voterDid || !targetDid) return 0;
  const last = lastAcceptedAt.get(pairKey(voterDid, targetDid));
  if (last === undefined) return 0;
  return Math.max(0, HOUR_MS - (Date.now() - last));
}

export async function profileStats(did) {
  await ready;
  const [full, received, cast] = await Promise.all([
    board({ sort: "top", limit: Number.MAX_SAFE_INTEGER }),
    activity({ limit: Number.MAX_SAFE_INTEGER, target: did }),
    activity({ limit: Number.MAX_SAFE_INTEGER, voter: did }),
  ]);
  const row = full.find((r) => r.did === did);
  await ensureProfilesLoaded([did]);
  const p = profileFor(did);
  return {
    did,
    handle: p.handle,
    displayName: p.displayName,
    avatar: p.avatar,
    score: row ? row.score : 0,
    rank: row ? row.rank : null,
    upvotes: received.filter((v) => v.delta > 0).length,
    downvotes: received.filter((v) => v.delta < 0).length,
    votesCast: cast.length,
    received,
    cast,
  };
}

// Polls local ingest state (no network round trip needed — it's the same
// stream the page is already watching) for a vote matching what was just
// written, up to timeoutMs. Resolves { seen: false } if it never shows —
// could be a slow relay, or the DO-replacement logic silently dropping it
// (cooldown/self-vote), same honest ambiguity the old server-polling had.
export async function waitForVote(voterDid, targetDid, delta, sinceMs, timeoutMs = 15000) {
  await ready;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = votes.find(
      (v) => v.voterDid === voterDid && v.targetDid === targetDid && v.delta === delta && v.createdAtMs >= sinceMs - 3000,
    );
    if (hit) return { seen: true };
    await new Promise((r) => setTimeout(r, 500));
  }
  return { seen: false };
}

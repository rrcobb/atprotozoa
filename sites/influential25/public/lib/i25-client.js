// i25-client.js — Influential25's tally/leaderboard engine, run in every
// visitor's own browser. Same shape as sites/socialcredit's sc-client.js
// (copy, don't abstract — see notes/40-new-site-playbook.md): there is no
// server holding a global index. Every net.bisks.influential25.vote record
// is a single account's nomination of another for "25 Most Influential
// Bluesky Posters of 2026" (pds.dad's original idea, tagged in by
// @caleb.jasik.xyz). A record has no delta — it either counts as a
// nomination or it doesn't.
//
// Two rules, replayed identically in every visitor's browser rather than
// trusted from whoever's casting the vote (the write always lands in the
// voter's own repo — the relay already verified it — a rule-breaking write
// just never counts, silently, same spirit as socialcredit's cooldown):
//   - no self-nomination
//   - each voter's first 10 *distinct* targets count, in createdAt order —
//     an 11th nomination, or a repeat of a target already nominated, is
//     dropped. There's no enforced floor (pds.dad's "5-10" is a suggestion,
//     not a rule a client-side check can meaningfully enforce), only a cap.
//
// Votes can arrive out of order (live Jetstream interleaved with historical
// backfill from many repos at once), so acceptance can't be decided
// incrementally — see socialcredit's sc-client.js header for why every raw
// candidate is kept in `rawByUri` and the accepted list is rebuilt from
// scratch (`recompute`) by sorting all of them by createdAt and replaying
// the per-voter cap. Cheap at this site's scale.

import * as store from "./i25-store.js";
import { GlobalBackfill } from "./global-backfill.js";

const JETSTREAM_HOSTS = [
  "jetstream1.us-east.bsky.network",
  "jetstream2.us-east.bsky.network",
  "jetstream1.us-west.bsky.network",
  "jetstream2.us-west.bsky.network",
];
const VOTE_COLLECTION = "net.bisks.influential25.vote";
const MAX_PER_VOTER = 10;
const BACKFILL_MS = 48 * 3600 * 1000; // Jetstream's own first-visit head start — global-backfill.js covers full history separately

let votes = []; // accepted nominations only, oldest first — rebuilt by recompute(), never mutated directly
const rawByUri = new Map(); // every candidate ever seen (accepted or not), keyed by uri — the source of truth

let started = null;
let socket = null;
let hostIdx = 0;
let cursorUs = null;
let closed = false;
let reconnectDelay = 1000;
let globalBackfill = null;

function jetstreamUrl(host, cursor) {
  const wanted = `wantedCollections=${encodeURIComponent(VOTE_COLLECTION)}`;
  const c = cursor != null ? `&cursor=${cursor}` : "";
  return `wss://${host}/subscribe?${wanted}${c}`;
}

function fromVoteRecord(did, rkey, r) {
  if (!r || typeof r.target !== "string") return null;
  const createdAtMs = Date.parse(r.createdAt);
  return {
    uri: `at://${did}/${VOTE_COLLECTION}/${rkey}`,
    voterDid: did,
    targetDid: r.target,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  };
}

// Records a candidate (from Jetstream or the global CAR backfill) as seen,
// regardless of whether it'll turn out to be accepted — self-nominations are
// the one exception, never worth keeping since the rule can't change later.
// Returns true if this is a genuinely new candidate (caller should recompute).
function addRaw(candidate) {
  if (!candidate || rawByUri.has(candidate.uri)) return false;
  if (candidate.voterDid === candidate.targetDid) return false;
  rawByUri.set(candidate.uri, candidate);
  store.putVote(candidate).catch(() => {});
  return true;
}

// No self-nomination (handled in addRaw above) and each voter's first
// MAX_PER_VOTER *distinct* targets count, in createdAt order. Rebuilds
// `votes` from scratch by replaying every known candidate — see the file
// header for why this can't be decided incrementally as each candidate
// arrives.
function recompute() {
  const sorted = Array.from(rawByUri.values()).sort(
    (a, b) => a.createdAtMs - b.createdAtMs || (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0),
  );
  const accepted = [];
  const targetsByVoter = new Map(); // voterDid -> Set(targetDid) already counted
  for (const c of sorted) {
    let targets = targetsByVoter.get(c.voterDid);
    if (!targets) {
      targets = new Set();
      targetsByVoter.set(c.voterDid, targets);
    }
    if (targets.has(c.targetDid)) continue; // repeat nomination of the same target — doesn't count again
    if (targets.size >= MAX_PER_VOTER) continue; // over the cap
    targets.add(c.targetDid);
    accepted.push(c);
  }
  votes = accepted;
}

function handleMessage(raw) {
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return;
  }
  if (evt.kind !== "commit" || !evt.commit || evt.commit.operation !== "create") return;
  if (evt.commit.collection !== VOTE_COLLECTION) return;
  if (typeof evt.time_us === "number") cursorUs = evt.time_us;
  const candidate = fromVoteRecord(evt.did, evt.commit.rkey, evt.commit.record);
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
const PUB = "https://api.bsky.app/xrpc";

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

export async function board({ limit = 100, query = "" } = {}) {
  await ready;
  const count = new Map();
  for (const v of votes) count.set(v.targetDid, (count.get(v.targetDid) || 0) + 1);

  let rows = [...count.entries()]
    .map(([did, votesReceived]) => ({ did, votesReceived }))
    .sort((a, b) => b.votesReceived - a.votesReceived || (a.did < b.did ? -1 : 1));
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
      createdAt: v.createdAtMs,
    };
  });
  if (query) {
    const q = query.toLowerCase();
    out = out.filter((v) => v.voterHandle.toLowerCase().includes(q) || v.targetHandle.toLowerCase().includes(q));
  }
  return out.slice(0, limit);
}

export async function statsFor(did) {
  await ready;
  let votesReceived = 0;
  for (const v of votes) if (v.targetDid === did) votesReceived++;
  return votesReceived;
}

// How many of this voter's own nominations already count towards their
// MAX_PER_VOTER cap (repeats of a target already nominated don't add to
// this). Used to warn "you're out of nominations" before a write that would
// just be silently dropped.
export async function nominationsUsed(voterDid) {
  await ready;
  if (!voterDid) return 0;
  const seen = new Set();
  for (const v of votes) if (v.voterDid === voterDid) seen.add(v.targetDid);
  return seen.size;
}

export async function alreadyNominated(voterDid, targetDid) {
  await ready;
  if (!voterDid || !targetDid) return false;
  return votes.some((v) => v.voterDid === voterDid && v.targetDid === targetDid);
}

export async function profileStats(did) {
  await ready;
  const [full, received, cast] = await Promise.all([
    board({ limit: Number.MAX_SAFE_INTEGER }),
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
    votesReceived: row ? row.votesReceived : 0,
    rank: row ? row.rank : null,
    nominationsCast: cast.length,
    received,
    cast,
  };
}

// Polls local ingest state (no network round trip needed — it's the same
// stream the page is already watching) for a nomination matching what was
// just written, up to timeoutMs. Resolves { seen: false } if it never shows
// — could be a slow relay, or the client-side cap/self-nomination check
// silently dropping it, same honest ambiguity as socialcredit's waitForVote.
export async function waitForVote(voterDid, targetDid, sinceMs, timeoutMs = 15000) {
  await ready;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = votes.find(
      (v) => v.voterDid === voterDid && v.targetDid === targetDid && v.createdAtMs >= sinceMs - 3000,
    );
    if (hit) return { seen: true };
    await new Promise((r) => setTimeout(r, 500));
  }
  return { seen: false };
}

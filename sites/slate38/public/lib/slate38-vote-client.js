// slate38-vote-client.js — THE SLATE's on-site vote tally engine, run in
// every visitor's own browser. Same shape as sites/influential25's
// i25-client.js (copy, don't abstract — see notes/40-new-site-playbook.md):
// there is no server holding a global index. Every net.bisks.slate38.vote
// record is a single account's endorsement of one of the 38 #bsky38 picks —
// a real atproto write, separate from and not a substitute for actually
// voting at bsky38.com (that's a direct write into *their* system, which
// this site has no access to — see the "no lexicon" note in
// sites/mootfluence). This is slate38's own honest, parallel vote.
//
// Two rules, replayed identically in every visitor's browser rather than
// trusted from whoever's casting the vote (the write always lands in the
// voter's own repo — the relay already verified it — a rule-breaking write
// just never counts, silently, same spirit as socialcredit's cooldown):
//   - no self-endorsement
//   - each voter's first 10 *distinct* targets count, in createdAt order
//     (mirrors bsky38.com's own "you get 10 votes" rule) — an 11th
//     endorsement, or a repeat of a target already endorsed, is dropped.
//
// Votes can arrive out of order (live Jetstream interleaved with historical
// backfill from many repos at once), so acceptance can't be decided
// incrementally — every raw candidate is kept in `rawByUri` and the accepted
// list is rebuilt from scratch (`recompute`) by sorting all of them by
// createdAt and replaying the per-voter cap. Cheap at this site's scale.

import * as store from "./slate38-store.js";
import { GlobalBackfill } from "./global-backfill.js";

const JETSTREAM_HOSTS = [
  "jetstream1.us-east.bsky.network",
  "jetstream2.us-east.bsky.network",
  "jetstream1.us-west.bsky.network",
  "jetstream2.us-west.bsky.network",
];
const VOTE_COLLECTION = "net.bisks.slate38.vote";
const MAX_PER_VOTER = 10;
const BACKFILL_MS = 48 * 3600 * 1000; // Jetstream's own first-visit head start — global-backfill.js covers full history separately

let votes = []; // accepted endorsements only, oldest first — rebuilt by recompute(), never mutated directly
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

function addRaw(candidate) {
  if (!candidate || rawByUri.has(candidate.uri)) return false;
  if (candidate.voterDid === candidate.targetDid) return false;
  rawByUri.set(candidate.uri, candidate);
  store.putVote(candidate).catch(() => {});
  return true;
}

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
    if (targets.has(c.targetDid)) continue; // repeat endorsement of the same target — doesn't count again
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

// Tally restricted to `dids` (the 38 slate candidates) — a stray endorsement
// of someone off the ticket (there's nothing stopping a raw record from
// naming any DID) just never shows up on THE SLATE's own board.
export async function boardFor(dids) {
  await ready;
  const wanted = new Set(dids);
  const count = new Map();
  for (const v of votes) {
    if (!wanted.has(v.targetDid)) continue;
    count.set(v.targetDid, (count.get(v.targetDid) || 0) + 1);
  }
  return count;
}

export async function votesReceived(did) {
  await ready;
  let n = 0;
  for (const v of votes) if (v.targetDid === did) n++;
  return n;
}

// How many of this voter's own endorsements already count towards their
// MAX_PER_VOTER cap (repeats of a target already endorsed don't add to
// this). Used to warn "you're out of endorsements" before a write that would
// just be silently dropped.
export async function endorsementsUsed(voterDid) {
  await ready;
  if (!voterDid) return 0;
  const seen = new Set();
  for (const v of votes) if (v.voterDid === voterDid) seen.add(v.targetDid);
  return seen.size;
}

export async function alreadyEndorsed(voterDid, targetDid) {
  await ready;
  if (!voterDid || !targetDid) return false;
  return votes.some((v) => v.voterDid === voterDid && v.targetDid === targetDid);
}

export function maxPerVoter() {
  return MAX_PER_VOTER;
}

// Polls local ingest state (no network round trip needed — it's the same
// stream the page is already watching) for an endorsement matching what was
// just written, up to timeoutMs. Resolves { seen: false } if it never shows
// — could be a slow relay, or the client-side cap/self-vote check silently
// dropping it, same honest ambiguity as influential25's waitForVote.
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

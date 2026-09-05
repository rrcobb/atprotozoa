// bsky38-vote-client.js — a live tally of bsky38.com's OWN real ballot,
// read straight off the network in every visitor's own browser. This is not
// slate38's parallel net.bisks.slate38.vote (see slate38-vote-client.js,
// right next to this file) — this reads and can write the actual
// com.bsky38.influential.vote records bsky38.com itself counts, confirmed
// against pds.dad's source (tangled.org/@pds.dad/influential-posters):
// votes are real PDS record writes via OAuth, one per (voter, subject) pair,
// with the record key set to the subject's DID. @antiali.as, 2026-09-05,
// pushed back on this site's earlier "real ballot happens over there, and
// this doesn't touch it" framing: "no, you can read & write the real
// records from PDS." This file is that correction.
//
// bsky38.com tallies server-side (SQLite, via its own Jetstream indexer) —
// see the README: a vote is `counted` if it's within the voter's first 10
// distinct subjects by createdAt order, `over_limit` past that, `self` if
// voter === subject. This client replays the identical rule against the raw
// records themselves, same shape as slate38-vote-client.js and
// influential25's i25-client.js (copy, don't abstract). It won't always
// match bsky38.com's own indexer to the record — a write can lag their
// indexer briefly, or arrive out of order — but it's computed from the same
// real records, not a proxy or a guess.
//
// Two rules, replayed identically rather than trusted from whoever's
// casting the vote (the write always lands in the voter's own repo — the
// relay already verified it — a rule-breaking write just never counts):
//   - no self-vote
//   - each voter's first 10 *distinct* subjects count, in createdAt order
//     — an 11th vote, or a repeat of a subject already voted for, is dropped
//     (bsky38.com's own MAX_VOTES=10, confirmed from the README).

import * as store from "./bsky38-store.js";
import { GlobalBackfill } from "./bsky38-backfill.js";

const JETSTREAM_HOSTS = [
  "jetstream1.us-east.bsky.network",
  "jetstream2.us-east.bsky.network",
  "jetstream1.us-west.bsky.network",
  "jetstream2.us-west.bsky.network",
];
export const VOTE_COLLECTION = "com.bsky38.influential.vote";
const MAX_PER_VOTER = 10;
const BACKFILL_MS = 48 * 3600 * 1000; // Jetstream's own first-visit head start — bsky38-backfill.js covers full history separately

let votes = []; // accepted votes only, oldest first — rebuilt by recompute(), never mutated directly
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
  if (!r || typeof r.subject !== "string") return null;
  const createdAtMs = Date.parse(r.createdAt);
  return {
    uri: `at://${did}/${VOTE_COLLECTION}/${rkey}`,
    voterDid: did,
    targetDid: r.subject,
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
    if (targets.has(c.targetDid)) continue; // repeat vote for the same subject — doesn't count again
    if (targets.size >= MAX_PER_VOTER) continue; // over bsky38.com's own cap
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

// Tally restricted to `dids` (the 38 slate candidates) — the real ballot
// has plenty of votes for people off THE SLATE entirely; this is just the
// crossover with our own 38.
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

export async function votesUsed(voterDid) {
  await ready;
  if (!voterDid) return 0;
  const seen = new Set();
  for (const v of votes) if (v.voterDid === voterDid) seen.add(v.targetDid);
  return seen.size;
}

export async function alreadyVoted(voterDid, targetDid) {
  await ready;
  if (!voterDid || !targetDid) return false;
  return votes.some((v) => v.voterDid === voterDid && v.targetDid === targetDid);
}

export function maxPerVoter() {
  return MAX_PER_VOTER;
}

// Polls local ingest state (no network round trip — same stream the page is
// already watching) for a vote matching what was just written, up to
// timeoutMs. Resolves { seen: false } if it never shows — could be a slow
// relay, or the client-side cap/self-vote check silently dropping it, same
// honest ambiguity as slate38-vote-client.js's waitForVote.
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

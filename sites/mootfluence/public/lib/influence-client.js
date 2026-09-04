// influence-client.js — a read-only tally engine for
// net.bisks.influential25.vote, run in every visitor's own browser. Trimmed
// from sites/influential25/lib/i25-client.js (copy, don't abstract):
// mootfluence never casts a nomination, so the write-side helpers
// (nominationsUsed, alreadyNominated, waitForVote) are dropped — this file
// only ever needs to answer "how many nominations does this DID have."
//
// Same acceptance rules as influential25 itself, replayed identically here
// rather than trusted from whoever cast the vote (the write always lands in
// the voter's own repo — a rule-breaking write just never counts, silently):
//   - no self-nomination
//   - each voter's first 10 *distinct* targets count, in createdAt order

import * as store from "./vote-store.js";
import { GlobalBackfill } from "./vote-backfill.js";

const JETSTREAM_HOSTS = [
  "jetstream1.us-east.bsky.network",
  "jetstream2.us-east.bsky.network",
  "jetstream1.us-west.bsky.network",
  "jetstream2.us-west.bsky.network",
];
const VOTE_COLLECTION = "net.bisks.influential25.vote";
const MAX_PER_VOTER = 10;
const BACKFILL_MS = 48 * 3600 * 1000;

let votes = []; // accepted nominations only, oldest first — rebuilt by recompute()
const rawByUri = new Map();

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
  const targetsByVoter = new Map();
  for (const c of sorted) {
    let targets = targetsByVoter.get(c.voterDid);
    if (!targets) {
      targets = new Set();
      targetsByVoter.set(c.voterDid, targets);
    }
    if (targets.has(c.targetDid)) continue;
    if (targets.size >= MAX_PER_VOTER) continue;
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
    totalVotes: votes.length,
    connected: !!(socket && socket.readyState === 1),
    globalBackfill: globalBackfill ? globalBackfill.status() : null,
  };
}

// Every DID with at least one accepted nomination, ranked by count.
export async function board() {
  await ready;
  const count = new Map();
  for (const v of votes) count.set(v.targetDid, (count.get(v.targetDid) || 0) + 1);
  const rows = [...count.entries()]
    .map(([did, votesReceived]) => ({ did, votesReceived }))
    .sort((a, b) => b.votesReceived - a.votesReceived || (a.did < b.did ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

export async function statsFor(did) {
  await ready;
  let votesReceived = 0;
  for (const v of votes) if (v.targetDid === did) votesReceived++;
  return votesReceived;
}

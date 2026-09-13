// race.js — for a set of participants (a handle + its mutuals), find out
// who replied to whom first. For each participant, downloads their whole
// repo as one CAR (car.js's fetchRepoRecordsWithKeys, one request no matter
// how much history exists — see notes/40-new-site-playbook.md's cee.wtf
// bulk-read order) and scans every app.bsky.feed.post record for a `reply`
// whose parent belongs to another participant. A reply's parent URI already
// embeds the parent author's DID (at://<did>/<collection>/<rkey>), so no
// extra lookups are needed to know who a reply targets.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const POST_TYPE = "app.bsky.feed.post";

// CONCURRENCY bounds how many repo downloads run at once — a politeness/
// browser-memory limit (don't open 200 simultaneous fetches to 200 different
// PDSs), not a cap on how many participants get scanned. Every participant
// is still scanned; this only paces how fast.
const CONCURRENCY = 6;

function didFromUri(uri) {
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

// Scans one participant's repo and returns Map<targetDid, {createdAt, uri}>
// — their earliest reply to each other did in `targetDids`. Throws if the
// repo can't be read at all (no PDS, oversized CAR, network failure); the
// caller treats that participant as "unknown" rather than "no replies."
export async function firstRepliesFrom(did, targetDids) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't resolve a PDS for " + did);
  const { records } = await fetchRepoRecordsWithKeys(pds, did, POST_TYPE);
  const first = new Map();
  for (const { uri, value } of records) {
    const parentUri = value?.reply?.parent?.uri;
    if (!parentUri) continue;
    const targetDid = didFromUri(parentUri);
    if (!targetDid || targetDid === did || !targetDids.has(targetDid)) continue;
    const createdAt = value.createdAt;
    if (!createdAt || typeof createdAt !== "string") continue;
    const cur = first.get(targetDid);
    if (!cur || createdAt < cur.createdAt) first.set(targetDid, { createdAt, uri });
  }
  return first;
}

// Runs firstRepliesFrom for every participant, bounded concurrency.
// onEach(participant, map|null, doneCount, total) fires as each finishes —
// map is null when that participant's repo couldn't be read at all (private/
// deleted/oversized/PDS down), so the grid can still render with a visible
// "unknown" gap instead of hanging on one bad account.
export async function buildRaceGrid(participants, onEach) {
  const targetDids = new Set(participants.map((p) => p.did));
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < participants.length) {
      const p = participants[next++];
      let map = null;
      try {
        map = await firstRepliesFrom(p.did, targetDids);
      } catch {
        map = null;
      }
      done++;
      onEach(p, map, done, participants.length);
    }
  }
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, participants.length) },
    worker,
  );
  await Promise.all(workers);
}

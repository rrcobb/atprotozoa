// records.js — writes the signed-in player's roster to their own PDS:
// net.bisks.kolpelor.roster, rkey "self", create-or-update via putRecord.
//
// Copy, don't abstract: same dpopFetch/putRecord upsert pattern as
// sites/catspace/public/lib/records.js, pointed at kolpelor's own lexicon.

import { dpopFetch, resolvePds } from "./oauth.js";

export const ROSTER_COLLECTION = "net.bisks.kolpelor.roster";

export async function getMyRoster(session) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ repo: session.did, collection: ROSTER_COLLECTION, rkey: "self" });
  const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) return null;
  const j = await res.json();
  return j.value || null;
}

// Read another player's roster record straight off their own PDS — no auth,
// same shape as getMyRoster but resolving the PDS from their DID doc first
// instead of a signed-in session. Used by app.js's "tracks" feature (see
// net.bisks.kolpelor.roster.json's `region` field) to spot which moots are
// last known to be wandering the homeland the trainer is currently in.
// Returns null for anyone who's never played, or whose PDS/record lookup
// fails for any reason — a moot with no roster just doesn't show a track.
export async function getPublicRoster(did) {
  try {
    const pds = await resolvePds(did);
    if (!pds) return null;
    const params = new URLSearchParams({ repo: did, collection: ROSTER_COLLECTION, rkey: "self" });
    const res = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) return null;
    const j = await res.json();
    return j.value || null;
  } catch {
    return null;
  }
}

// putRecord create-or-updates in one call (no separate create/update branch
// needed client-side) — the PDS itself treats it as an upsert on rkey.
export async function saveRoster(session, roster) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: ROSTER_COLLECTION,
      rkey: "self",
      record: { $type: ROSTER_COLLECTION, ...roster },
    }),
  });
  if (!res.ok) {
    throw new Error(`saveRoster failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.uri; // at://<did>/net.bisks.kolpelor.roster/self
}

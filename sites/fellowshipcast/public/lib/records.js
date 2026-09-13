// records.js — reads and writes the signed-in user's own ballot
// (net.bisks.fellowshipcast.ballot, rkey "self", create-or-update).
//
// Copy, don't abstract: same putRecord-upsert pattern as
// sites/catspace/public/lib/records.js, just pointed at this site's own
// lexicon. One ballot per voter — re-casting overwrites the same record
// rather than piling up history, so a change of heart doesn't need a delete.

import { dpopFetch } from "./oauth.js";

export const COLLECTION = "net.bisks.fellowshipcast.ballot";

export async function getMyBallot(session) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ repo: session.did, collection: COLLECTION, rkey: "self" });
  const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) return null;
  return res.json();
}

// putRecord create-or-updates in one call (no separate create/update branch
// needed client-side) — the PDS itself treats it as an upsert on rkey.
export async function saveBallot(session, casting) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const now = new Date().toISOString();
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: COLLECTION,
      rkey: "self",
      record: { $type: COLLECTION, casting, updatedAt: now },
    }),
  });
  if (!res.ok) {
    throw new Error(`saveBallot failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.uri; // at://<did>/net.bisks.fellowshipcast.ballot/self
}

// records.js — writes to the signed-in user's own PDS: the shelf photo
// record (net.bisks.shelfguessr.shelf, rkey "self", create-or-update) and a
// guess record (net.bisks.shelfguessr.guess, create-only, TID rkey).
//
// Copy, don't abstract: same dpopFetch-based write pattern as every other
// OAuth site in this repo (see sites/catspace/public/lib/records.js), just
// pointed at shelfguessr's own lexicons.

import { dpopFetch } from "./oauth.js";

export const SHELF_COLLECTION = "net.bisks.shelfguessr.shelf";
export const GUESS_COLLECTION = "net.bisks.shelfguessr.guess";

export async function getMyShelf(session) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ repo: session.did, collection: SHELF_COLLECTION, rkey: "self" });
  const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) return null;
  return res.json();
}

// putRecord create-or-updates in one call (no separate create/update branch
// needed client-side) — the PDS itself treats it as an upsert on rkey.
export async function saveShelf(session, { photo, caption }) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const record = {
    $type: SHELF_COLLECTION,
    photo,
    updatedAt: new Date().toISOString(),
  };
  if (caption) record.caption = caption;
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: SHELF_COLLECTION,
      rkey: "self",
      record,
    }),
  });
  if (!res.ok) {
    throw new Error(`saveShelf failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.uri; // at://<did>/net.bisks.shelfguessr.shelf/self
}

export async function recordGuess(session, { actual, guessed, correct, clusterSeed }) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: GUESS_COLLECTION,
      record: {
        $type: GUESS_COLLECTION,
        actual,
        guessed,
        correct,
        clusterSeed,
        guessedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`recordGuess failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.uri;
}

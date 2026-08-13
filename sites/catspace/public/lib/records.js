// records.js — writes to the signed-in user's own PDS: the cat profile
// record (net.bisks.catspace.profile, rkey "self", create-or-update) and a
// guestbook comment (net.bisks.catspace.comment, create-only, TID rkey).
//
// Copy, don't abstract: same dpopFetch-based write pattern as every other
// OAuth site in this repo, just pointed at catspace's own lexicon.

import { dpopFetch } from "./oauth.js";

export const PROFILE_COLLECTION = "net.bisks.catspace.profile";
export const COMMENT_COLLECTION = "net.bisks.catspace.comment";

export async function getMyProfile(session) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ repo: session.did, collection: PROFILE_COLLECTION, rkey: "self" });
  const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) return null;
  return res.json();
}

// putRecord create-or-updates in one call (no separate create/update branch
// needed client-side) — the PDS itself treats it as an upsert on rkey.
export async function saveProfile(session, profile) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: PROFILE_COLLECTION,
      rkey: "self",
      record: { $type: PROFILE_COLLECTION, ...profile },
    }),
  });
  if (!res.ok) {
    throw new Error(`saveProfile failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.uri; // at://<did>/net.bisks.catspace.profile/self
}

export async function postComment(session, subjectDid, text) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: COMMENT_COLLECTION,
      record: {
        $type: COMMENT_COLLECTION,
        subject: subjectDid,
        text,
        createdAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`postComment failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.uri;
}

// records.js — writes to the signed-in user's own PDS: the opt-in consent
// record (net.bisks.elopt.optin, rkey "self", create-or-update / delete) and
// a battle vote (net.bisks.elopt.vote, deterministic rkey so re-voting the
// same matchup+thread overwrites instead of stacking).
//
// Copy, don't abstract: same dpopFetch-based write pattern as every other
// OAuth site in this repo (e.g. sites/catspace/public/lib/records.js), just
// pointed at elopt's own lexicons.

import { dpopFetch } from "./oauth.js";
import { voteRkey } from "./vote-key.js";

export { voteRkey };
export const OPTIN_COLLECTION = "net.bisks.elopt.optin";
export const VOTE_COLLECTION = "net.bisks.elopt.vote";

export async function getMyOptin(session) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ repo: session.did, collection: OPTIN_COLLECTION, rkey: "self" });
  const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) return null;
  return res.json();
}

export async function optIn(session) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: OPTIN_COLLECTION,
      rkey: "self",
      record: { $type: OPTIN_COLLECTION, consent: true, createdAt: new Date().toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`optIn failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.uri;
}

export async function optOut(session) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: OPTIN_COLLECTION, rkey: "self" }),
  });
  if (!res.ok) throw new Error(`optOut failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function castVote(session, subjectA, subjectB, winner, threadUri) {
  if (winner !== subjectA && winner !== subjectB) throw new Error("winner must be one of the two subjects");
  const base = session.pdsUrl.replace(/\/$/, "");
  const rkey = voteRkey(subjectA, subjectB, threadUri);
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: VOTE_COLLECTION,
      rkey,
      record: {
        $type: VOTE_COLLECTION,
        subjectA,
        subjectB,
        winner,
        thread: threadUri,
        createdAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(`castVote failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.uri;
}

// records.js — writes a run to the signed-in user's own PDS
// (net.bisks.kinesin.walk, create-only, TID rkey).
//
// Copy, don't abstract: same dpopFetch-based write pattern as every other
// OAuth site in this repo (see sites/shelfguessr/public/lib/records.js), just
// pointed at kinesin's own lexicon.

import { dpopFetch } from "./oauth.js";

export const WALK_COLLECTION = "net.bisks.kinesin.walk";

export async function recordWalk(session, { distance, steps }) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: WALK_COLLECTION,
      record: {
        $type: WALK_COLLECTION,
        distance: Math.round(distance),
        steps: Math.round(steps),
        walkedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`recordWalk failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.uri; // at://<did>/net.bisks.kinesin.walk/<rkey>
}

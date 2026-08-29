// publish.js — writes the app.bsky.feed.generator declaration record that
// makes homemixer show up as a real, subscribable feed in the Bluesky app.
//
// This build has no OAuth session or app password for any account, so it
// can't publish this record itself — see the file comment at the top of
// src/index.ts. Instead this runs in the *visitor's* browser, using their own
// signed-in session (oauth.js), and writes the record into their own repo.
// The only write this site ever makes: com.atproto.repo.createRecord on
// app.bsky.feed.generator, matching the create-only scope in
// client-metadata.json / oauth.js's SCOPE.
//
// FEED_RKEY must match src/index.ts's FEED_RKEY — that's the rkey
// getFeedSkeleton checks against when a `feed` URI comes in.
import { dpopFetch } from "./oauth.js";

export const SERVICE_DID = "did:web:homemixer.bisks.net";
export const FEED_RKEY = "homemixer";

export async function publishFeedGenerator(session) {
  const record = {
    $type: "app.bsky.feed.generator",
    did: SERVICE_DID,
    displayName: "homemixer",
    description:
      "a live port of X's home-mixer pipeline shape (candidate sourcing, light rank, heavy rank, in/out-of-network mixing) over your Bluesky follow graph — no ML, nothing stored, evaluated fresh every load. homemixer.bisks.net",
    createdAt: new Date().toISOString(),
  };

  const res = await dpopFetch(session, `${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.generator",
      rkey: FEED_RKEY,
      record,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    return { ok: true, uri: data.uri, alreadyPublished: false };
  }

  const errBody = await res.text().catch(() => "");
  if (res.status === 400 && /already exists/i.test(errBody)) {
    return {
      ok: true,
      uri: `at://${session.did}/app.bsky.feed.generator/${FEED_RKEY}`,
      alreadyPublished: true,
    };
  }
  throw new Error(`publish failed (${res.status}): ${errBody.slice(0, 300)}`);
}

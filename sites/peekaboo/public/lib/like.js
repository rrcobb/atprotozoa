// like.js — fire a real app.bsky.feed.like record, straight to the user's own
// PDS via their DPoP-bound OAuth session. This is peekaboo's whole mechanic:
// tapping a covered square does the exact same write as tapping the heart on
// bsky.app for that post, nothing more (create-only, no unlike, no delete —
// see client-metadata.json / lib/oauth.js SCOPE).

import { dpopFetch } from "./oauth.js";

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

// Like a post. `subject` is { uri, cid }. Returns the created record { uri, cid }.
export async function likePost(session, subject) {
  const res = await dpopFetch(session, pdsXrpc(session, "com.atproto.repo.createRecord"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.like",
      record: {
        $type: "app.bsky.feed.like",
        subject: { uri: subject.uri, cid: subject.cid },
        createdAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`like failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

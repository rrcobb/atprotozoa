// actions.js — like / repost / quote, written straight to the user's own PDS
// through their DPoP-bound OAuth session. All create-only (see lib/oauth.js SCOPE).

import { dpopFetch } from "./oauth.js";

async function createRecord(session, collection, record) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection, record: { $type: collection, ...record } }),
  });
  if (!res.ok) throw new Error(`${collection.split(".").pop()} failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

const ref = (p) => ({ uri: p.uri, cid: p.cid });

export const likePost = (s, p) =>
  createRecord(s, "app.bsky.feed.like", { subject: ref(p), createdAt: new Date().toISOString() });

export const repostPost = (s, p) =>
  createRecord(s, "app.bsky.feed.repost", { subject: ref(p), createdAt: new Date().toISOString() });

export const quotePost = (s, p, text) =>
  createRecord(s, "app.bsky.feed.post", {
    text,
    embed: { $type: "app.bsky.embed.record", record: ref(p) },
    createdAt: new Date().toISOString(),
  });

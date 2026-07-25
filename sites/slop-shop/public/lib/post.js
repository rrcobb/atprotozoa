// post.js — fire a Bluesky post carrying a generated slop-ad flyer image.
// Trimmed from sites/trigrams/public/lib/post.js: this is a single standalone
// image post, so the reply-ref and link-facet machinery there isn't needed.
//
// Writes go to the user's own PDS via the OAuth session's dpopFetch.

import { dpopFetch } from "./oauth.js";

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

// Upload an image blob to the user's repo. `bytes` is a Uint8Array/ArrayBuffer,
// `mime` like "image/png". Returns the blob ref to embed.
export async function uploadImage(session, bytes, mime = "image/png") {
  const res = await dpopFetch(session, pdsXrpc(session, "com.atproto.repo.uploadBlob"), {
    method: "POST",
    headers: { "content-type": mime },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`uploadBlob failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.blob; // { $type: "blob", ref, mimeType, size }
}

// Fire: create the post. opts:
//   text   — the post text (the slop ad copy)
//   image  — { blob, alt } from uploadImage
// Returns the created record { uri, cid }.
export async function firePost(session, opts) {
  const { text, image } = opts;
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };
  if (image?.blob) {
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [{ image: image.blob, alt: image.alt || text }],
    };
  }

  const res = await dpopFetch(session, pdsXrpc(session, "com.atproto.repo.createRecord"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });
  if (!res.ok) {
    throw new Error(`createRecord failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json(); // { uri, cid }
}

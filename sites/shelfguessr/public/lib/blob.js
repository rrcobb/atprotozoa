// blob.js — upload a bookshelf photo to the logged-in user's own repo.
//
// Copy, don't abstract: trimmed from sites/catspace/public/lib/blob.js.
// Writes go through the OAuth session's dpopFetch.

import { dpopFetch } from "./oauth.js";

// Upload an image blob to the user's repo. `bytes` is a Uint8Array/ArrayBuffer,
// `mime` like "image/jpeg". Returns the blob ref to embed as `photo`.
export async function uploadImage(session, bytes, mime) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.uploadBlob`, {
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

// post.js — create a Bluesky post carrying a Shadow Simcluster cipher: text
// (and optionally an image) plus a real `#shadowsimcluster` tag facet, so the
// /shadow page can find these posts via searchPosts and cross-reference
// authors against a viewer's moots. Writes go to the user's own PDS via the
// OAuth session's dpopFetch. Trimmed from sites/trigrams/public/lib/post.js
// (copy, don't abstract) — dropped the reply-ref and link-facet machinery
// this site doesn't use, kept the byte-offset tag facet and image embed.

import { dpopFetch } from "./oauth.js";

export const TAG = "shadowsimcluster";

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

// A `app.bsky.richtext.facet#tag` over the literal "#shadowsimcluster"
// substring of `text`. Facet byteStart/byteEnd are UTF-8 byte offsets, not JS
// string indices — a fixed ASCII tag makes that arithmetic trivial, but do it
// properly anyway in case the surrounding cipher text has multibyte runes.
function tagFacet(text) {
  const needle = `#${TAG}`;
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  const enc = new TextEncoder();
  const byteStart = enc.encode(text.slice(0, idx)).length;
  const byteEnd = byteStart + enc.encode(needle).length;
  return {
    index: { byteStart, byteEnd },
    features: [{ $type: "app.bsky.richtext.facet#tag", tag: TAG }],
  };
}

// Fire: create the post. opts:
//   text   — the post text; the caller is responsible for including the
//            literal "#shadowsimcluster" substring somewhere in it
//   image  — { blob, alt, width, height } from uploadImage (optional)
// Returns the created record { uri, cid }.
export async function firePost(session, opts) {
  const { text, image } = opts;
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };

  const f = tagFacet(text);
  if (f) record.facets = [f];

  if (image?.blob) {
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          image: image.blob,
          alt: image.alt || "a Shadow Simcluster cipher, hidden in this image",
          ...(image.width && image.height
            ? { aspectRatio: { width: image.width, height: image.height } }
            : {}),
        },
      ],
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

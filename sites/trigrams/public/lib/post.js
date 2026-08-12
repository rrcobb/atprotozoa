// post.js — the shared "fire an arrow" core: create a Bluesky post carrying a
// trigram's text, a link facet, and a card image. Used by both /quiver (fire as a
// standalone post) and /launcher (fire at a target post as a reply).
//
// Writes go to the user's own PDS via the OAuth session's dpopFetch. Two lessons
// copied from mino's io/worker.js reply builder: (1) reply refs need root+parent
// strongRefs, with root = the parent's own root if the parent is itself a reply;
// (2) rich-text facets index by UTF-8 BYTE offsets, not JS string indices.

import { dpopFetch } from "./oauth.js";

const APPVIEW = "https://api.bsky.app";

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

// Build the post text + a single link facet over a chosen substring. Facet
// byteStart/byteEnd are UTF-8 byte offsets into `text`.
function linkFacet(text, linkText, uri) {
  const enc = new TextEncoder();
  const idx = text.indexOf(linkText);
  if (idx < 0) return null;
  const byteStart = enc.encode(text.slice(0, idx)).length;
  const byteEnd = byteStart + enc.encode(linkText).length;
  return {
    index: { byteStart, byteEnd },
    features: [{ $type: "app.bsky.richtext.facet#link", uri }],
  };
}

// Resolve a bsky.app post URL (or at:// uri) to { uri, cid } and its thread root,
// so we can build a correct reply ref. Uses the AppView getPostThread.
export async function resolvePostRef(urlOrUri) {
  let atUri = urlOrUri.trim();
  const m = atUri.match(
    /bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/,
  );
  if (m) {
    // profile can be a handle or did; resolve handle -> did for the at:// uri.
    let did = m[1];
    if (!did.startsWith("did:")) {
      const r = await fetch(
        `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`,
      );
      if (r.ok) did = (await r.json()).did;
    }
    atUri = `at://${did}/app.bsky.feed.post/${m[2]}`;
  }
  if (!atUri.startsWith("at://")) throw new Error("not a bsky post URL");

  const r = await fetch(
    `${APPVIEW}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0`,
  );
  if (!r.ok) throw new Error(`couldn't load that post (${r.status})`);
  const t = (await r.json()).thread;
  const post = t?.post;
  if (!post) throw new Error("post not found");

  // root = the parent's own root if it's already a reply, else the parent itself.
  const parentReply = post.record?.reply;
  const root = parentReply?.root || { uri: post.uri, cid: post.cid };
  return {
    display: { text: post.record?.text || "", handle: post.author?.handle, uri: post.uri },
    parent: { uri: post.uri, cid: post.cid },
    root: { uri: root.uri, cid: root.cid },
  };
}

// Fire: create the post. opts:
//   text        — the post text (e.g. the trigram)
//   linkText    — substring of text to hyperlink (optional)
//   linkUri     — the URL the link points to (e.g. the coining post)
//   image       — { blob, alt, width, height } from uploadImage + makeCard (optional)
//   replyRef    — { root, parent } from resolvePostRef (optional; omit = top-level)
// Returns the created record { uri, cid }.
export async function firePost(session, opts) {
  const { text, linkText, linkUri, image, replyRef } = opts;
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };

  if (linkText && linkUri) {
    const f = linkFacet(text, linkText, linkUri);
    if (f) record.facets = [f];
  }
  if (image?.blob) {
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          image: image.blob,
          alt: image.alt || text,
          // Without this Bluesky has to guess the shape before the blob is
          // fetched, and guesses wrong for a wide card — tell it up front.
          ...(image.width && image.height
            ? { aspectRatio: { width: image.width, height: image.height } }
            : {}),
        },
      ],
    };
  }
  if (replyRef?.root && replyRef?.parent) {
    record.reply = { root: replyRef.root, parent: replyRef.parent };
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

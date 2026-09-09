// post.js — the entire write path: turn typed text (+ optional photo, +
// optional reply target) into a real app.bsky.feed.post on the signer's own
// PDS. Adapted from trigrams/public/lib/post.js, trimmed to what a plain
// composer needs (no link-card facet).
//
// resolvePostRef reads the *public*, unauthenticated AppView — never the
// signed-in session — so pasting a link to reply to costs nothing in scope.
// The OAuth session itself (see oauth.js) only ever has permission to create
// a post or upload a blob; it can't read anything back even if this file
// wanted it to.

import { dpopFetch } from "./oauth.js";

const APPVIEW = "https://api.bsky.app";

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

// Upload an image blob to the user's repo. `bytes` is an ArrayBuffer/Uint8Array,
// `mime` like "image/jpeg". Returns the blob ref to embed.
export async function uploadImage(session, bytes, mime) {
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

// Auto-link bare URLs in the text as app.bsky.richtext.facet#link facets.
// Byte offsets, not JS string indices — Bluesky facets are UTF-8 byte-indexed.
function autoLinkFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /https?:\/\/[^\s]+[^\s.,!?)\]]/g;
  let m;
  while ((m = re.exec(text))) {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(m[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }],
    });
  }
  return facets;
}

// Resolve a bsky.app post URL (or at:// uri) to its strong refs, so a reply
// carries a correct root+parent. Public AppView call — no session involved.
export async function resolvePostRef(urlOrUri) {
  let atUri = String(urlOrUri || "").trim();
  const m = atUri.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
  if (m) {
    let did = m[1];
    if (!did.startsWith("did:")) {
      const r = await fetch(
        `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`,
      );
      if (!r.ok) throw new Error("couldn't resolve that handle");
      did = (await r.json()).did;
    }
    atUri = `at://${did}/app.bsky.feed.post/${m[2]}`;
  }
  if (!atUri.startsWith("at://")) throw new Error("that doesn't look like a bsky post link");

  const r = await fetch(
    `${APPVIEW}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0`,
  );
  if (!r.ok) throw new Error(`couldn't load that post (${r.status})`);
  const t = (await r.json()).thread;
  const post = t?.post;
  if (!post) throw new Error("post not found — is the link right?");

  const parentReply = post.record?.reply;
  const root = parentReply?.root || { uri: post.uri, cid: post.cid };
  return {
    handle: post.author?.handle || "",
    parent: { uri: post.uri, cid: post.cid },
    root: { uri: root.uri, cid: root.cid },
  };
}

// Fire the post. opts:
//   text     — the post text
//   image    — { blob, alt, width, height } from uploadImage (optional)
//   replyRef — { root, parent } from resolvePostRef (optional; omit = top-level)
// Returns { uri, cid } straight from the PDS — the only thing this site ever
// "reads back," and only because createRecord's own response hands it over
// for free. Nothing further is ever fetched.
export async function firePost(session, opts) {
  const { text, image, replyRef } = opts;
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };

  const facets = autoLinkFacets(text);
  if (facets.length) record.facets = facets;

  if (image?.blob) {
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          image: image.blob,
          alt: image.alt || "",
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

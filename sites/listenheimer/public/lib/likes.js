// likes.js — resolve a pasted Bluesky post URL to an AT-URI, then read every
// public liker via app.bsky.feed.getLikes.
//
// getLikes has no bulk-download equivalent (it's an AppView aggregate, not a
// repo-backed collection any single account owns) — the "prefer bulk reads"
// standing order in sites/buildthis/builder/INSTRUCTIONS.md carves out
// exactly this case as one where pagination is the only option. MAX_LIKE_PAGES
// below is a safety backstop (100 likers/page, so 2000 pages is 200,000
// likers), not a default-caution cap — nothing normal will ever hit it.

import { jget, resolveDid } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";
const MAX_LIKE_PAGES = 2000; // hard safety backstop: 200,000 likers

// Accepts a bsky.app post URL, an at:// URI, or "<handle-or-did>/<rkey>".
// Returns { uri, did, rkey }.
export async function resolvePostUri(raw) {
  const s = (raw || "").trim();
  if (!s) throw new Error("paste a post URL first");

  let handleOrDid, rkey;
  const webMatch = s.match(/bsky\.app\/profile\/([^/\s]+)\/post\/([^/\s?#]+)/i);
  const atMatch = s.match(/^at:\/\/([^/\s]+)\/app\.bsky\.feed\.post\/([^/\s?#]+)$/i);
  if (webMatch) {
    [, handleOrDid, rkey] = webMatch;
  } else if (atMatch) {
    [, handleOrDid, rkey] = atMatch;
  } else {
    const parts = s.replace(/^@/, "").split("/").filter(Boolean);
    if (parts.length === 2) [handleOrDid, rkey] = parts;
  }
  if (!handleOrDid || !rkey) {
    throw new Error("couldn't find a post in that — paste a bsky.app post link");
  }

  const did = await resolveDid(handleOrDid);
  return { uri: `at://${did}/app.bsky.feed.post/${rkey}`, did, rkey };
}

// Fetch the post itself (for author/text display) via the public AppView.
export async function getPost(uri) {
  const d = await jget(`${PUB}/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
  const post = (d.posts || [])[0];
  if (!post) throw new Error("post not found (deleted, or blocked from you)");
  return post;
}

// Page through every public liker of a post. Each liker's actor is already a
// full ProfileView from the getLikes response, so no extra profile-lookup
// round trip is needed. Returns [{ did, handle, displayName, avatar }].
export async function getAllLikers(uri, onStep) {
  const likers = [];
  const seen = new Set();
  let cursor = "";
  for (let page = 0; page < MAX_LIKE_PAGES; page++) {
    const u = new URL(`${PUB}/app.bsky.feed.getLikes`);
    u.searchParams.set("uri", uri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    for (const like of d.likes || []) {
      const actor = like.actor;
      if (!actor || !actor.did || seen.has(actor.did)) continue;
      seen.add(actor.did);
      likers.push({
        did: actor.did,
        handle: actor.handle,
        displayName: actor.displayName || actor.handle,
        avatar: actor.avatar || "",
      });
    }
    if (onStep) onStep(likers.length);
    cursor = d.cursor;
    if (!cursor || !(d.likes || []).length) break;
  }
  return likers;
}

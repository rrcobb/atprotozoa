// likes.js — resolve a pasted Bluesky post URL to an AT-URI, then read every
// public liker.
//
// Likers come from microcosm.blue's Constellation first (lib/microcosm.js,
// the drop-in): it indexes every like record off the firehose by the post it
// points at and returns DIDs 1000 per page, against the AppView's 100. The list this site
// writes only needs DIDs, so only the likers shown in the avatar grid get a
// profile lookup (getProfiles, 25 per call). app.bsky.feed.getLikes is the
// fallback if Constellation errors — same recipe as kevinmoot's followers
// read (notes/40, "Ecosystem tools"). Both page caps below are runaway
// backstops, not budgets.

import { jget, resolveDid, getProfiles } from "./identity.js";
import { likerDids } from "./microcosm.js";

const PUB = "https://api.bsky.app/xrpc";
const MAX_LIKE_PAGES = 2000; // fallback walk: 200,000 likers at 100/page

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

// Every liker of a post as [{ did, handle, displayName, avatar }]. Only the
// first `hydrate` entries carry a real handle/avatar; the rest have handle set
// to the DID, which is all the list write needs.
export async function getAllLikers(uri, onStep, { hydrate = 400 } = {}) {
  let dids;
  try {
    dids = await likerDids(uri, { onStep });
  } catch (e) {
    console.warn("constellation failed, falling back to getLikes", e);
    return getAllLikersAppView(uri, onStep);
  }
  const profiles = await getProfiles(dids.slice(0, hydrate));
  return dids.map((did) => profiles.get(did) || { did, handle: did, displayName: did, avatar: "" });
}

async function getAllLikersAppView(uri, onStep) {
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

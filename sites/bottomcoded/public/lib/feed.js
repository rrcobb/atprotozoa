// feed.js — resolve a handle and pull their latest ~100 authored posts.
// Reads Bluesky's public AppView anonymously (public.api.bsky.app, CORS *,
// no auth): resolveHandle, getProfile, getAuthorFeed. Pagination style
// copied from topchicken/lib/scan.js (copy, don't abstract).

const PUB = "https://public.api.bsky.app/xrpc";

export const TARGET_POSTS = 100;
const MAX_PAGES = 4; // <= 400 feed items scanned before giving up on hitting TARGET_POSTS

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).message || msg; } catch (_) {}
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export function cleanHandle(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

export async function resolveActor(rawHandle) {
  const cleaned = cleanHandle(rawHandle);
  if (!cleaned) throw new Error("enter a handle first");
  const did = cleaned.startsWith("did:")
    ? cleaned
    : (await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(cleaned)}`)).did;
  if (!did) throw new Error(`couldn't resolve "${cleaned}"`);
  const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return profile;
}

// Latest `count` posts this account actually wrote (skips reposts; keeps
// replies — a reply is still their own words). Returns
// [{ text, createdAt, uri, likeCount }], newest first.
export async function fetchLatestPosts(did, count = TARGET_POSTS, { onProgress } = {}) {
  const out = [];
  let cursor = "";
  for (let pg = 0; pg < MAX_PAGES && out.length < count; pg++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      if (item.reason) continue; // repost, not their own words
      const post = item.post;
      const rec = post && post.record;
      if (!post || !rec || typeof rec.text !== "string") continue;
      out.push({
        text: rec.text,
        createdAt: rec.createdAt || post.indexedAt,
        uri: post.uri,
        likeCount: post.likeCount || 0,
      });
      if (out.length >= count) break;
    }
    cursor = d.cursor;
    if (onProgress) onProgress(out.length, count);
    if (!cursor) break;
  }
  return out;
}

export function bskyLink(uri, fallbackHandle) {
  const m = (uri || "").match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${fallbackHandle || m[1]}/post/${m[2]}`;
}

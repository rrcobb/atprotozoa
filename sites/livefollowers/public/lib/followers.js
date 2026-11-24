// followers.js — follower list + per-follower "last seen" lookups.
// Bluesky has no public "last login", so last seen = the newest post or repost
// the follower has made (what the AppView author feed shows).
import { followerDids } from "./microcosm.js";

export const PUB = "https://public.api.bsky.app/xrpc";
const CONCURRENCY = 10; // parallel author-feed requests; the public AppView is shared, be polite

export function cleanHandle(actor) {
  return (actor || "").trim().replace(/^@/, "").replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "").split("/")[0];
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function resolveDid(actor) {
  const a = cleanHandle(actor);
  if (!a) throw new Error("enter a handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export const fetchProfile = (did) => jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);

// Constellation first (1000 DIDs a page, every page); if it's down, walk
// getFollowers to an empty cursor. Both read the whole list.
export async function allFollowerDids(did, onStep) {
  try {
    return await followerDids(did, { onStep: (n) => onStep && onStep(n) });
  } catch (_) {
    const out = [];
    let cursor;
    do {
      const d = await jget(`${PUB}/app.bsky.graph.getFollowers?actor=${encodeURIComponent(did)}&limit=100${cursor ? "&cursor=" + cursor : ""}`);
      for (const f of d.followers || []) out.push(f.did);
      cursor = d.cursor;
      if (onStep) onStep(out.length);
    } while (cursor);
    return out;
  }
}

export function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Newest of the first few feed items (a pinned post can sit first, so don't trust item 0).
// Returns { iso|null, profile } or null if the account can't be read (deactivated, taken down).
export async function lastSeen(did) {
  try {
    const d = await jget(`${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=3&filter=posts_with_replies`);
    let best = null;
    let author = null;
    for (const it of d.feed || []) {
      const iso = (it.reason && it.reason.indexedAt) || (it.post && it.post.indexedAt);
      if (it.post && it.post.author && it.post.author.did === did) author = it.post.author;
      if (iso && (!best || Date.parse(iso) > Date.parse(best))) best = iso;
    }
    return { did, iso: best, author };
  } catch (_) {
    return null;
  }
}

// Runs lastSeen over dids with CONCURRENCY workers; stop() -> true halts early.
export async function scan(dids, onResult, stop) {
  let i = 0;
  const worker = async () => {
    while (i < dids.length && !stop()) {
      const did = dids[i++];
      onResult(await lastSeen(did));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

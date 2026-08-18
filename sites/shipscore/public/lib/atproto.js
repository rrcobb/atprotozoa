// atproto.js — read-side helper: resolve a handle/DID/URL to a full public
// profile, a recent-posts fetch (replies included, since reply behavior is
// itself a compatibility signal here), and the direct follow relationship
// between two actors. Copy, don't abstract: trimmed and extended from
// profilebrawl's atproto.js (adds getRelationship; getAuthorFeed here keeps
// replies instead of filtering them out).

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving handle/DID/URL parsing, copied from alice-meets-bob's resolveDid.
export function normalizeActor(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

// Fetches the full public profile (app.bsky.actor.getProfile) for a
// handle, DID, or bsky.app profile URL. Throws if the actor can't be found.
export async function getProfile(actor) {
  const a = normalizeActor(actor);
  if (!a) throw new Error("empty handle");
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(a)}`);
}

// Fetches up to `limit` (max 100 per page) of an account's own recent posts
// AND replies — reposts of other people's content are dropped (a repost
// isn't this account's own writing), but replies stay in, since whether and
// how often someone replies is itself a compatibility signal here.
export async function getAuthorFeed(did, limit = 100) {
  const out = [];
  let cursor;
  while (out.length < limit) {
    const page = Math.min(100, limit - out.length);
    const url = `${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=${page}&filter=posts_with_replies${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
    }`;
    const data = await jget(url);
    const items = (data.feed || []).filter((it) => !it.reason && it.post?.author?.did === did);
    out.push(...items.map((it) => it.post));
    if (!data.cursor || !data.feed?.length) break;
    cursor = data.cursor;
  }
  return out.slice(0, limit);
}

// Direct follow relationship between two DIDs, from `actorDid`'s point of
// view — one call covers both directions: `following` is set if actorDid
// already follows otherDid, `followedBy` is set if otherDid already follows
// actorDid back. Real signal, not a guess: the same edge the app itself
// renders as "follows you".
export async function getRelationship(actorDid, otherDid) {
  const url = `${PUB}/app.bsky.graph.getRelationships?actor=${encodeURIComponent(actorDid)}&others=${encodeURIComponent(otherDid)}`;
  const data = await jget(url);
  const rel = (data.relationships || [])[0];
  if (!rel || rel.notFound) return { following: false, followedBy: false };
  return { following: !!rel.following, followedBy: !!rel.followedBy };
}

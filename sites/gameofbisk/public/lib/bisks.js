// bisks.js — resolve a handle or a bsky.app post link to one specific "bisk"
// (Bluesky post) to render onto the grid. Reads Bluesky's public AppView
// anonymously (api.bsky.app, CORS *, no auth). Trimmed from
// sites/biskshow/public/lib/pool.js (copy, don't abstract) — this version
// only needs resolveDid + a recent-posts list + a direct post lookup, not
// the guessing-game pool machinery.

const PUB = "https://api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from pool.js's resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return { did: p.did, handle: p.handle, displayName: p.displayName || p.handle, avatar: p.avatar || "" };
}

// A full bsky.app post link, e.g.
// https://bsky.app/profile/norvid-studies.bsky.social/post/3lk2x...
const POST_LINK_RE = /profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/;

export function parsePostLink(input) {
  const m = POST_LINK_RE.exec(String(input || "").trim());
  if (!m) return null;
  return { actor: m[1], rkey: m[2] };
}

function postToBisk(item) {
  const rec = item.record || {};
  return {
    uri: item.uri,
    text: typeof rec.text === "string" ? rec.text : "",
    createdAt: rec.createdAt || item.indexedAt || "",
    likeCount: item.likeCount || 0,
    author: {
      did: item.author.did,
      handle: item.author.handle,
      displayName: item.author.displayName || item.author.handle,
      avatar: item.author.avatar || "",
    },
  };
}

// A specific, directly-addressed bisk: resolve the author + rkey straight
// into one post record, no feed pagination needed.
export async function getPostByLink(actor, rkey) {
  const did = await resolveDid(actor);
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const thread = await jget(`${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`);
  const post = thread && thread.thread && thread.thread.post;
  if (!post) throw new Error("couldn't load that post");
  return postToBisk(post);
}

// Recent top-level, non-reply, non-repost posts for one account — a small
// picker list to choose which bisk to grid-ify. One page (up to 100) is
// plenty for "pick one of their recent posts"; this isn't a full-history
// read, so no bulk getRepo download is warranted here.
export async function getRecentPosts(actor, { limit = 15 } = {}) {
  const did = await resolveDid(actor);
  const author = await getProfile(did);
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", "50");
  u.searchParams.set("filter", "posts_no_replies");
  const d = await jget(u.toString());
  const posts = (d.feed || [])
    .filter((it) => !it.reason) // skip reposts
    .map((it) => postToBisk(it.post))
    .filter((b) => b.text.trim().length > 0)
    .slice(0, limit);
  return { author, posts };
}

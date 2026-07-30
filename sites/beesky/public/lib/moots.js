// moots.js — turn a Bluesky handle into its moots (mutuals — follows ∩
// followers), one cell per moot in the hive, plus each moot's latest
// original post for the info panel when you fly up to their cell. Reads
// Bluesky's PUBLIC AppView anonymously (public.api.bsky.app, CORS *, no
// auth): resolveHandle, getFollows, getFollowers, getProfile,
// getAuthorFeed. Copied+trimmed from dial-a-mutual/public/lib/moots.js
// (copy, don't abstract).

const PUB = "https://public.api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows + ~1200 followers scanned for moots
const FEED_PAGES = 3; // ≤ ~300 posts scanned for a playable message

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
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

export async function resolveDid(actor) {
  const a = cleanHandle(actor);
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle to its moots. Returns:
//   { did, handle, self, pool: [{did,handle,displayName,avatar}] }
// `pool` excludes self and is capped at 200 speed-dial slots (plenty for a
// phonebook nobody will page all the way through).
export async function moots(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  let self = {
    did,
    handle: cleanHandle(actor),
    displayName: cleanHandle(actor),
    avatar: "",
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
  } catch {}

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const pool = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    pool.push(profileOf(f));
  }

  return { did, handle: self.handle, self, pool: pool.slice(0, 200) };
}

function postUrl(handle, uri) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// A moot's most recent original text post (skips reposts and bare-media/quote
// posts with no words to read). Returns null if nothing playable turns up in
// FEED_PAGES worth of scanning.
export async function latestPost(did, fallbackHandle) {
  let cursor = "";
  for (let pg = 0; pg < FEED_PAGES; pg++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      if (item.reason) continue; // skip reposts — we want THEIR voice
      const post = item.post;
      const text = post?.record?.text;
      if (!text || !text.trim()) continue;
      const author = post.author || {};
      const handle = author.handle || fallbackHandle;
      return {
        text: text.trim(),
        url: postUrl(handle, post.uri),
        createdAt: post.record.createdAt || post.indexedAt,
        likeCount: post.likeCount || 0,
      };
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return null;
}

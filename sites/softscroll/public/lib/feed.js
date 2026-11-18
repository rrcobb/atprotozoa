// feed.js — mutual graph + each account's recent posts, all from Bluesky's
// public AppView (api.bsky.app: CORS *, no auth). Reads are bounded by TIME,
// not by a page count: each account's author feed is walked newest-first
// until it reaches a post older than the chosen window (or runs out), so a
// prolific poster is read in full for the window and a quiet one costs a
// single request.

const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGE_CAP = 400; // backstop for getFollows/getFollowers (no bulk equivalent), unreachable in practice
const FEED_PAGE_CAP = 400; // same backstop on a single account's window walk
const CONCURRENCY = 6; // simultaneous accounts being read

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("enter a handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
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
  for (let p = 0; p < GRAPH_PAGE_CAP; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// You plus every mutual follow.
export async function circle(did, { onStep } = {}) {
  if (onStep) onStep("mapping who you follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows you back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);
  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }
  let me = { did, handle: did, displayName: did, avatar: "" };
  try {
    me = profileOf(await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`));
  } catch {}
  return { me, mutuals, pool: [me, ...mutuals] };
}

// Turn an AppView feed item into the shape classify() and the UI want.
export function postOf(profile, item) {
  const post = item.post;
  if (!post || item.reason) return null; // reposts aren't their own work
  const rec = post.record || {};
  const embed = post.embed || {};
  const media = embed.$type === "app.bsky.embed.recordWithMedia#view" ? embed.media || {} : embed;
  const links = [];
  for (const f of rec.facets || []) {
    for (const ft of f.features || []) if (ft.$type === "app.bsky.richtext.facet#link" && ft.uri) links.push(ft.uri);
  }
  let external = null;
  if (media.$type === "app.bsky.embed.external#view" && media.external) {
    const e = media.external;
    external = { uri: e.uri, title: e.title || "", description: e.description || "", thumb: e.thumb || "" };
  }
  const images = media.$type === "app.bsky.embed.images#view" ? (media.images || []).map((i) => ({ thumb: i.thumb, alt: i.alt || "" })) : [];
  const hasVideo = media.$type === "app.bsky.embed.video#view";
  const text = rec.text || "";
  if (!text.trim() && !external && !images.length && !hasVideo) return null;
  return {
    uri: post.uri,
    handle: profile.handle,
    displayName: profile.displayName,
    avatar: profile.avatar,
    text,
    links,
    external,
    images,
    hasVideo,
    hasMedia: !!(images.length || hasVideo || external),
    isReply: !!rec.reply,
    likes: post.likeCount || 0,
    reposts: post.repostCount || 0,
    createdAt: rec.createdAt || post.indexedAt || "",
  };
}

// One account's posts newer than `sinceMs`. Pinned posts ride along at the
// top of the feed with a reason; they're skipped without ending the walk.
async function walkOne(profile, sinceMs) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < FEED_PAGE_CAP; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", profile.did);
    u.searchParams.set("filter", "posts_no_replies");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    let reachedOld = false;
    for (const item of d.feed || []) {
      const post = postOf(profile, item);
      if (item.reason) continue;
      const t = Date.parse(item.post?.record?.createdAt || item.post?.indexedAt || "");
      if (Number.isFinite(t) && t < sinceMs) {
        reachedOld = true;
        continue;
      }
      if (post) out.push(post);
    }
    cursor = d.cursor;
    if (reachedOld || !cursor) break;
  }
  return out;
}

// Read every account in `pool` for the window. onProgress({done,total,posts}).
// Accounts that error (deleted, private PDS hiccup) are counted, not fatal.
export async function readWindow(pool, sinceMs, { onProgress, onPosts } = {}) {
  let done = 0;
  let failed = 0;
  let count = 0;
  let next = 0;
  async function worker() {
    while (next < pool.length) {
      const prof = pool[next++];
      try {
        const posts = await walkOne(prof, sinceMs);
        count += posts.length;
        if (onPosts) onPosts(posts);
      } catch {
        failed++;
      }
      done++;
      if (onProgress) onProgress({ done, total: pool.length, posts: count, failed });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pool.length) }, worker));
  return { failed };
}

export function postUrl(uri, handle) {
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

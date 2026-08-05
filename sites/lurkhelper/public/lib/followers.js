// followers.js — resolve a handle, fetch its profile, page through its full
// follower list, and figure out which of those followers ever engaged with
// its recent posts (liked, reposted, or replied) — the rest are "lurkers."
// Reads Bluesky's public AppView anonymously (public.api.bsky.app, CORS *).
// Handle-resolution + follower paging copied from sites/followwall (copy,
// don't abstract); the recent-post + engagement fetch is new.

const PUB = "https://public.api.bsky.app/xrpc";

// Hard cap so a mega-account (millions of followers) doesn't turn one page
// load into thousands of requests — plenty to fill a wall and compute stats.
const MAX_PAGES = 20; // 20 * 100 = up to 2000 followers

// How many recent posts to check for engagement, and how many likers/
// reposters/repliers to read per post. Each post costs up to 3 requests
// (likes, reposts, thread), so this bounds the whole lurker check to a
// couple dozen requests instead of scaling with account size.
const MAX_POSTS = 10;
const MAX_ENGAGERS_PER_POST = 100;

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

export async function fetchProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    description: p.description || "",
    followersCount: p.followersCount || 0,
    followingCount: p.followsCount || 0,
    postsCount: p.postsCount || 0,
  };
}

// Every follower of `did`, newest-first (the order the AppView returns),
// capped at MAX_PAGES pages.
export async function fetchFollowers(did, { onStep } = {}) {
  const followers = [];
  let cursor = "";
  for (let pg = 0; pg < MAX_PAGES; pg++) {
    if (onStep) onStep(`reading followers… (page ${pg + 1}, ${followers.length} found so far)`);
    const u = new URL(`${PUB}/app.bsky.graph.getFollowers`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const f of d.followers || []) {
      followers.push({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName || f.handle,
        avatar: f.avatar || "",
        description: f.description || "",
      });
    }
    cursor = d.cursor;
    if (!cursor || !(d.followers || []).length) break;
  }
  return followers;
}

// The account's own most recent posts (skipping reposts of other people's
// stuff), newest first, capped at MAX_POSTS.
export async function fetchRecentPosts(did) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", String(MAX_POSTS));
  u.searchParams.set("filter", "posts_no_replies");
  let d;
  try {
    d = await jget(u.toString());
  } catch {
    return [];
  }
  return (d.feed || [])
    .map((f) => f.post)
    .filter((p) => p && p.author && p.author.did === did)
    .slice(0, MAX_POSTS);
}

// Every DID that liked, reposted, or directly replied to a single post.
async function fetchPostEngagers(uri) {
  const dids = new Set();

  const likes = new URL(`${PUB}/app.bsky.feed.getLikes`);
  likes.searchParams.set("uri", uri);
  likes.searchParams.set("limit", String(MAX_ENGAGERS_PER_POST));
  try {
    const d = await jget(likes.toString());
    for (const l of d.likes || []) if (l.actor?.did) dids.add(l.actor.did);
  } catch {}

  const reposts = new URL(`${PUB}/app.bsky.feed.getRepostedBy`);
  reposts.searchParams.set("uri", uri);
  reposts.searchParams.set("limit", String(MAX_ENGAGERS_PER_POST));
  try {
    const d = await jget(reposts.toString());
    for (const a of d.repostedBy || []) if (a.did) dids.add(a.did);
  } catch {}

  const thread = new URL(`${PUB}/app.bsky.feed.getPostThread`);
  thread.searchParams.set("uri", uri);
  thread.searchParams.set("depth", "1");
  thread.searchParams.set("parentHeight", "0");
  try {
    const d = await jget(thread.toString());
    for (const r of d.thread?.replies || []) {
      const rd = r.post?.author?.did;
      if (rd) dids.add(rd);
    }
  } catch {}

  return dids;
}

// The set of DIDs who liked, reposted, or replied to any of `posts`.
export async function fetchEngagedDids(posts, { onStep } = {}) {
  const engaged = new Set();
  for (let i = 0; i < posts.length; i++) {
    if (onStep) onStep(`checking who's engaged… (post ${i + 1} of ${posts.length})`);
    const dids = await fetchPostEngagers(posts[i].uri);
    for (const d of dids) engaged.add(d);
  }
  return engaged;
}

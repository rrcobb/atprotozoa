// history.js — pull one account's own post history (skipping reposts) far
// enough back to cover the "1 week" window, then compute the moist-chicken
// metric (total likes ÷ follower count) for five trailing windows and a
// rolling-24h trend line across the week. Reads Bluesky's public AppView
// anonymously (public.api.bsky.app, CORS *): resolveHandle, getProfile,
// getAuthorFeed. Handle-resolution + pagination shape copied from
// sites/moistchicken/public/lib/network.js and scan.js (copy, don't
// abstract) — the difference here: one account's own feed instead of a
// whole follows-∪-followers network, and windows/trend instead of a single
// 24h ranking.

const PUB = "https://public.api.bsky.app/xrpc";

const WEEK_MS = 7 * 86400000;
const FEED_PAGES = 20; // <= ~2000 recent items — plenty for a week even for a prolific poster

export const WINDOWS = [
  { key: "1h", label: "last hour", ms: 3600000 },
  { key: "8h", label: "last 8 hours", ms: 8 * 3600000 },
  { key: "12h", label: "last 12 hours", ms: 12 * 3600000 },
  { key: "24h", label: "last 24 hours", ms: 86400000 },
  { key: "1w", label: "last week", ms: WEEK_MS },
];

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
    followersCount: p.followersCount || 0,
    followingCount: p.followsCount || 0,
    postsCount: p.postsCount || 0,
  };
}

// Every post `did` wrote (no reposts) with createdAt >= sinceMs, newest-first
// paging until either FEED_PAGES is exhausted or a page's oldest item is
// already older than sinceMs.
export async function fetchOwnPosts(did, sinceMs, { onStep } = {}) {
  const posts = [];
  let cursor = "";
  for (let pg = 0; pg < FEED_PAGES; pg++) {
    if (onStep) onStep(`reading posts… (page ${pg + 1}, ${posts.length} found so far)`);
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
    let stop = false;
    for (const item of d.feed || []) {
      if (item.reason) continue; // skip reposts — not something they wrote
      const post = item.post;
      const rec = post && post.record;
      if (!post || !rec) continue;
      const created = new Date(rec.createdAt || post.indexedAt).getTime();
      if (Number.isNaN(created)) continue;
      if (created >= sinceMs) {
        posts.push({
          uri: post.uri,
          createdAt: created,
          likeCount: post.likeCount || 0,
          record: rec,
          embed: post.embed,
          author: post.author,
        });
      } else {
        stop = true;
      }
    }
    cursor = d.cursor;
    if (stop || !cursor) break;
  }
  posts.sort((a, b) => a.createdAt - b.createdAt);
  return posts;
}

// Sum of likeCount for posts with createdAt in (end - windowMs, end].
function sumInWindow(posts, end, windowMs) {
  const start = end - windowMs;
  let totalLikes = 0;
  let postCount = 0;
  for (const p of posts) {
    if (p.createdAt > start && p.createdAt <= end) {
      totalLikes += p.likeCount;
      postCount++;
    }
  }
  return { totalLikes, postCount };
}

// The five trailing-window scores, each = totalLikes / max(followers, 1).
export function computeWindowScores(posts, followersCount, now) {
  const denom = Math.max(followersCount, 1);
  return WINDOWS.map((w) => {
    const { totalLikes, postCount } = sumInWindow(posts, now, w.ms);
    return { ...w, totalLikes, postCount, likesPerFollower: totalLikes / denom };
  });
}

// A rolling 24h likes-per-follower trend sampled across the last week —
// at each sample time t, the score is "as if you'd run clucktrack right
// then": total likes on posts from (t-24h, t] divided by current followers.
// (Follower count itself isn't available historically from the public
// AppView, so it's held constant at today's count — same simplification
// moistchicken makes for its single 24h snapshot.)
export function computeTrend(posts, followersCount, now, { steps = 42 } = {}) {
  const denom = Math.max(followersCount, 1);
  const points = [];
  for (let i = steps; i >= 0; i--) {
    const t = now - (i / steps) * WEEK_MS;
    const { totalLikes } = sumInWindow(posts, t, 86400000);
    points.push({ t, likesPerFollower: totalLikes / denom });
  }
  return points;
}

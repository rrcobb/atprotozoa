// scan.js — given a pool of profiles, find whoever racked up the most TOTAL
// likes per follower (summed likes across every post they made in the
// rolling last 24 hours, divided by their follower count) — so an account
// that blows up relative to its own size wins, not just whoever has the
// biggest audience to begin with.
// Reads app.bsky.feed.getAuthorFeed anonymously (public.api.bsky.app,
// CORS *). Concurrency helper + feed-walking copied from
// sites/topchicken/public/lib/scan.js (copy, don't abstract) — the
// difference here: sum likes per author instead of tracking a single best
// post, then rank by likes-per-follower instead of raw total.

const PUB = "https://public.api.bsky.app/xrpc";

const FEED_PAGES = 5; // <= ~500 recent items scanned per member before giving up
const CONCURRENCY = 10;
const RUNNERS_UP = 6; // kept alongside the winner for "the pecking order"

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Rolling 24h window ending "now" (not a UTC calendar day — the brief asked
// for "the past 24 hours").
export function last24h(now = new Date()) {
  const end = now.getTime();
  const start = end - 86400000;
  return { start, end };
}

async function pooledEach(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) || 1 }, worker),
  );
}

// Every post `member` made within [windowStart, windowEnd) — skips reposts.
// getAuthorFeed is newest-first, so paging stops as soon as an item is
// older than windowStart.
async function postsInWindow(member, windowStart, windowEnd) {
  const hits = [];
  let cursor = "";
  for (let pg = 0; pg < FEED_PAGES; pg++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", member.did);
    u.searchParams.set("limit", "100");
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
      if (created >= windowStart && created < windowEnd) hits.push(post);
      else if (created < windowStart) stop = true;
    }
    cursor = d.cursor;
    if (stop || !cursor) break;
  }
  return hits;
}

// Crawl the whole pool for the given window, summing likes per author.
// Returns { ranked, scannedMembers, postsSeen } where `ranked` is every
// author who posted in-window, sorted by total likes descending:
//   { did, author, totalLikes, postCount, posts: [post,...] (best-first) }
export async function scanNetwork(pool, windowStart, windowEnd, { onProgress } = {}) {
  const byAuthor = new Map();
  let scanned = 0;
  let postsSeen = 0;
  await pooledEach(pool, CONCURRENCY, async (member) => {
    try {
      const hits = await postsInWindow(member, windowStart, windowEnd);
      postsSeen += hits.length;
      for (const post of hits) {
        const did = post.author && post.author.did;
        if (!did) continue;
        let entry = byAuthor.get(did);
        if (!entry) {
          entry = { did, author: post.author, totalLikes: 0, postCount: 0, posts: [] };
          byAuthor.set(did, entry);
        }
        entry.totalLikes += post.likeCount || 0;
        entry.postCount++;
        entry.posts.push(post);
      }
    } catch {
      // one member's feed failing (suspended, blocked, gone) shouldn't sink the crawl
    }
    scanned++;
    if (onProgress) onProgress(scanned, pool.length);
  });

  const ranked = [...byAuthor.values()];
  for (const entry of ranked) entry.posts.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  ranked.sort((a, b) => b.totalLikes - a.totalLikes);

  return { ranked, scannedMembers: scanned, postsSeen };
}

// Fetch every in-window candidate's follower count (not in the feed
// response, only on the profile) and score them by totalLikes / followers —
// rewarding an account that blows up relative to its own size over one with
// a bigger audience to begin with. A brand-new account with zero followers
// is scored against 1 follower instead of dividing by zero. Runs the
// profile fetches at the same concurrency as the feed crawl, since everyone
// who posted in-window needs a lookup now (not just the top few, back when
// this was a cap check).
// Returns { winner, runnersUp } sorted by that per-follower score.
export async function rankByLikesPerFollower(ranked, { onCheck } = {}) {
  let checked = 0;
  await pooledEach(ranked, CONCURRENCY, async (entry) => {
    let followersCount;
    try {
      const p = await jget(
        `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(entry.did)}`,
      );
      followersCount = p.followersCount || 0;
    } catch {
      followersCount = 0; // lookup failed — treat as unknown, still eligible
    }
    entry.followersCount = followersCount;
    entry.likesPerFollower = entry.totalLikes / Math.max(followersCount, 1);
    checked++;
    if (onCheck) onCheck(entry, checked, ranked.length);
  });

  const scored = [...ranked].sort((a, b) => b.likesPerFollower - a.likesPerFollower);

  return {
    winner: scored[0] || null,
    runnersUp: scored.slice(1, 1 + RUNNERS_UP),
  };
}

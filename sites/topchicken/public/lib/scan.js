// scan.js — given a pool of profiles, find whoever posted the most-liked
// thing in a UTC calendar-day window. Reads app.bsky.feed.getAuthorFeed
// anonymously (public.api.bsky.app, CORS *). Concurrency helper copied from
// cloutgraph/lib/likes.js `pooledEach` (copy, don't abstract).

const PUB = "https://public.api.bsky.app/xrpc";

const FEED_PAGES = 5; // <= ~500 recent items scanned per member before giving up
const CONCURRENCY = 8;
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

// The previous full UTC calendar day relative to `now`: [start, end).
export function previousUtcDay(now = new Date()) {
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
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

// Every post `member` made within [dayStart, dayEnd) — skips reposts.
// getAuthorFeed is newest-first, so paging stops as soon as an item is
// older than dayStart; today's posts (>= dayEnd) are skipped but don't
// stop the walk, since older-but-still-in-window posts can follow them.
async function postsInWindow(member, dayStart, dayEnd) {
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
      if (created >= dayStart && created < dayEnd) hits.push(post);
      else if (created < dayStart) stop = true;
    }
    cursor = d.cursor;
    if (stop || !cursor) break;
  }
  return hits;
}

// Crawl the whole pool for the given UTC day window. Returns:
//   { winner: post|null, runnersUp: post[], scannedMembers, postsSeen }
// `winner`/`runnersUp` entries are raw AppView post views (author embedded).
export async function findTopChicken(pool, dayStart, dayEnd, { onProgress } = {}) {
  const found = [];
  let scanned = 0;
  let postsSeen = 0;
  await pooledEach(pool, CONCURRENCY, async (member) => {
    try {
      const hits = await postsInWindow(member, dayStart, dayEnd);
      postsSeen += hits.length;
      for (const post of hits) found.push(post);
    } catch {
      // one member's feed failing (suspended, blocked, gone) shouldn't sink the crawl
    }
    scanned++;
    if (onProgress) onProgress(scanned, pool.length);
  });

  found.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  const uniqueByAuthor = [];
  const seenAuthors = new Set();
  for (const post of found) {
    const did = post.author && post.author.did;
    if (did && seenAuthors.has(did)) continue; // one entry per author for the runners-up list
    if (did) seenAuthors.add(did);
    uniqueByAuthor.push(post);
  }

  return {
    winner: uniqueByAuthor[0] || null,
    runnersUp: uniqueByAuthor.slice(1, 1 + RUNNERS_UP),
    scannedMembers: scanned,
    postsSeen,
  };
}

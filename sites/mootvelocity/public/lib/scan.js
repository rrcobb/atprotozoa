// scan.js — page an account's post history (newest first, public AppView,
// same endpoint as sites/peakposting) looking backward for the start of its
// *current* active streak: the most recent point where it went quiet for a
// real stretch (GAP_DAYS+) before picking back up. That's "when they started
// posting a lot" instead of raw account age — the whole point of this site.
//
// Early-exit: since getAuthorFeed only ever returns actual posts (never
// empty months), the first page that jumps more than GAP_DAYS further back
// than the oldest post seen so far *is* the gap — we can stop right there.
// Nothing older than that gap matters for "the current streak", so most
// accounts resolve in a handful of requests, not a full history crawl.
//
// No page/time cap: an earlier version capped at 20 pages / 25s, which for
// high-frequency posters could hit the cap in under two weeks of calendar
// time and produce a bogus velocity extrapolated from a near-zero window
// (spot-checked 2026-08-22). cee.wtf asked to just use all available data,
// so every account's full history gets scanned until a real gap turns up or
// its history is exhausted — the only early exit left is the gap itself.

const PUB = "https://api.bsky.app/xrpc";

export const GAP_DAYS = 60; // a silence this long or longer ends the previous streak

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Scans `did`'s own authored posts (skips reposts) newest-first. Returns:
//   { streakStart: Date|null, postsSeen, pagesUsed, gapFound, exhausted }
// streakStart is the createdAt of the oldest post in the still-open current
// streak. null means no original posts were found at all (a pure lurker).
export async function scanActiveStreak(did, { onProgress } = {}) {
  let cursor;
  let pages = 0;
  let postsSeen = 0;

  let streakStart = null; // oldest post's Date in the current (still-open) block
  let prevAt = null; // createdAt Date of the previously processed (newer) post
  let gapFound = false;
  let exhausted = false;

  outer: while (true) {
    const params = new URLSearchParams({ actor: did, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let feed;
    try {
      feed = await jget(`${PUB}/app.bsky.feed.getAuthorFeed?${params}`);
    } catch {
      break;
    }
    const items = feed.feed || [];
    for (const item of items) {
      if (item.reason) continue; // skip reposts — only original posts count
      const post = item.post;
      if (!post || !post.author || post.author.did !== did) continue;
      const atStr = (post.record && post.record.createdAt) || post.indexedAt;
      if (!atStr) continue;
      const at = new Date(atStr);
      if (isNaN(at.getTime())) continue;

      postsSeen++;
      if (prevAt === null) {
        streakStart = at;
      } else {
        const gapDays = (prevAt.getTime() - at.getTime()) / 86400000;
        if (gapDays >= GAP_DAYS) {
          gapFound = true;
          break outer; // streakStart already holds the boundary
        }
        streakStart = at; // streak continues, extend the earliest edge back
      }
      prevAt = at;
    }
    pages++;
    if (onProgress) onProgress({ pages, postsSeen });
    cursor = feed.cursor;
    if (!cursor || items.length === 0) {
      exhausted = true; // reached the true start of the account's post history
      break;
    }
  }

  return { streakStart, postsSeen, pagesUsed: pages, gapFound, exhausted };
}

// Runs scanActiveStreak over a list of DIDs with bounded concurrency, so a
// pool of ~25 accounts doesn't fire 25 simultaneous multi-page crawls.
export async function scanPool(dids, { concurrency = 4, onEach, onProgress } = {}) {
  const results = new Map();
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < dids.length) {
      const i = next++;
      const did = dids[i];
      let res;
      try {
        res = await scanActiveStreak(did);
      } catch {
        res = { streakStart: null, postsSeen: 0, pagesUsed: 0, gapFound: false, exhausted: false, failed: true };
      }
      results.set(did, res);
      done++;
      if (onEach) onEach(did, res);
      if (onProgress) onProgress(done, dids.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, dids.length) }, worker);
  await Promise.all(workers);
  return results;
}

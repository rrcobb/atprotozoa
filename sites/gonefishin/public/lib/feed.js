// feed.js — turn one pond member into a catch: most of the time a "small
// fish" (a real post of theirs from the last 90 days that scored at or below
// their own median engagement), occasionally a "whopper" (one of their
// all-time highest-scoring posts, paired against a runner-up so landing it
// takes a real guess). Reads app.bsky.feed.getAuthorFeed off the public
// AppView anonymously — pattern copied from topchicken/public/lib/scan.js
// (copy, don't abstract).

const PUB = "https://public.api.bsky.app/xrpc";

const FEED_PAGES = 3; // <= ~300 recent items scanned per member before giving up
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_RECENT_FOR_MEDIAN = 6; // below this, the "median" is too noisy to trust
const WHOPPER_CHANCE = 0.15;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export function engagement(post) {
  return (
    (post.likeCount || 0) +
    (post.repostCount || 0) +
    (post.replyCount || 0) +
    (post.quoteCount || 0)
  );
}

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Every original post (skips reposts) a member has made, newest first, up to
// FEED_PAGES pages. Each entry carries `createdMs` alongside the raw AppView
// post view so callers don't re-parse the record.
async function fetchPosts(did) {
  const out = [];
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
      if (item.reason) continue; // skip reposts — not something they wrote
      const post = item.post;
      const rec = post && post.record;
      if (!post || !rec || typeof rec.text !== "string") continue;
      const createdMs = new Date(rec.createdAt || post.indexedAt).getTime();
      if (Number.isNaN(createdMs)) continue;
      out.push({ post, createdMs, score: engagement(post) });
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Try to hook a catch from one pond member. Returns null if they don't have
// enough usable posts (private/suspended feed, all-replies, brand new) —
// caller should move on to another member.
export async function tryCatch(member, now = Date.now()) {
  let posts;
  try {
    posts = await fetchPosts(member.did);
  } catch {
    return null;
  }
  if (posts.length < 3) return null;

  const recent = posts.filter((p) => now - p.createdMs <= NINETY_DAYS_MS);
  const medianPool = recent.length >= MIN_RECENT_FOR_MEDIAN ? recent : posts;
  if (medianPool.length < 3) return null;

  const med = median(medianPool.map((p) => p.score));
  const low = medianPool.filter((p) => p.score <= med);
  const lowPool = low.length ? low : medianPool;

  const byScoreDesc = posts.slice().sort((a, b) => b.score - a.score);
  const top = byScoreDesc[0];

  const wantWhopper = Math.random() < WHOPPER_CHANCE;
  if (wantWhopper && top && byScoreDesc.length >= 2) {
    // the decoy is a runner-up, not a random dud — the guess should be a
    // real guess, not a coin flip against an obvious loser.
    const decoy = byScoreDesc.find((p) => p !== top && p.score !== top.score) || byScoreDesc[1];
    if (decoy && decoy.post.uri !== top.post.uri) {
      return {
        type: "whopper",
        member,
        median: med,
        whopper: top,
        decoy,
      };
    }
  }

  const pick = lowPool[Math.floor(Math.random() * lowPool.length)];
  return {
    type: "smallfish",
    member,
    median: med,
    fish: pick,
  };
}

// Try up to `attempts` random pond members before giving up (a member might
// have a private/suspended/empty feed). Removes tried members from a copy of
// the pool so a bad member isn't retried in the same cast.
export async function castLine(pool, attempts = 5) {
  const candidates = pool.slice();
  for (let i = 0; i < attempts && candidates.length; i++) {
    const idx = Math.floor(Math.random() * candidates.length);
    const member = candidates.splice(idx, 1)[0];
    const result = await tryCatch(member);
    if (result) return result;
  }
  return null;
}

// discourse.js — turns (your oomfs, your oomfs-of-oomfs) into a scored,
// pairwise-similarity set of "threads" (posts): the raw material for the
// walking map. Two stages, both against the public AppView, anonymous:
//
//   1. Candidate posts: sample recent posts authored by a slice of your
//      oomfs — that's "what your corner of the sky is currently posting."
//   2. Resonance: for each candidate, pull its likers (getLikes) and score
//      it by how many of those likers are your oomfs (weight 3) or your
//      oomfs-of-oomfs (weight 1) — "what your corner of the sky is
//      currently liking." That resonant-liker set doubles as the input to
//      pairwise similarity (Jaccard), which is what the layout uses for
//      proximity: two threads liked by an overlapping set of your people
//      end up near each other on the map.
//
// Everything here is capped — a full crawl of "current discourse" is
// unbounded, this is a fun approximation, not a research tool.

const PUB = "https://public.api.bsky.app/xrpc";

const AUTHOR_SAMPLE = 18; // how many oomfs' feeds get sampled for candidates
const POSTS_PER_AUTHOR = 20; // one page each
const MAX_CANDIDATES = 70; // trimmed before the (expensive) getLikes pass
const MAX_NODES = 26; // final map size
const MIN_NODES = 8; // backfill with lower-signal posts if resonance is thin
const RECENT_DAYS = 5;
const CONCURRENCY = 6;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function authorFeed(did) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", String(POSTS_PER_AUTHOR));
  u.searchParams.set("filter", "posts_no_replies");
  const d = await jget(u.toString());
  return d.feed || [];
}

async function getLikers(uri) {
  const u = new URL(`${PUB}/app.bsky.feed.getLikes`);
  u.searchParams.set("uri", uri);
  u.searchParams.set("limit", "100");
  const d = await jget(u.toString());
  return (d.likes || []).map((l) => l.actor?.did).filter(Boolean);
}

export async function gatherThreads(oomfPool, oomfs2, { onStep } = {}) {
  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  const sample = oomfPool.slice(0, AUTHOR_SAMPLE);
  const oomfSet = new Set(oomfPool.map((p) => p.did));

  if (onStep) onStep("sampling recent posts from your oomfs…");
  const feeds = await mapLimit(sample, CONCURRENCY, (oomf) => authorFeed(oomf.did));

  const seen = new Set();
  let candidates = [];
  for (const feed of feeds) {
    if (!feed) continue;
    for (const item of feed) {
      if (item.reason) continue; // skip reposts, we want original posts
      const post = item.post;
      if (!post?.uri || seen.has(post.uri)) continue;
      const text = post.record?.text?.trim();
      if (!text) continue;
      const createdAt = Date.parse(post.record?.createdAt || post.indexedAt || 0);
      if (!createdAt || createdAt < cutoff) continue;
      seen.add(post.uri);
      candidates.push({
        uri: post.uri,
        authorDid: post.author?.did,
        authorHandle: post.author?.handle,
        authorDisplayName: post.author?.displayName || post.author?.handle,
        authorAvatar: post.author?.avatar || "",
        text,
        likeCount: post.likeCount || 0,
        createdAt,
      });
    }
  }

  // Rank by a light recency+engagement blend and trim before the
  // expensive-per-post getLikes pass.
  const now = Date.now();
  candidates.sort((a, b) => {
    const scoreA = a.likeCount - (now - a.createdAt) / 3600000 / 6;
    const scoreB = b.likeCount - (now - b.createdAt) / 3600000 / 6;
    return scoreB - scoreA;
  });
  candidates = candidates.slice(0, MAX_CANDIDATES);

  if (onStep) onStep(`checking who liked ${candidates.length} posts…`);
  let done = 0;
  const scored = await mapLimit(candidates, CONCURRENCY, async (post) => {
    const likers = await getLikers(post.uri);
    done++;
    if (onStep) onStep(`checking who liked your oomfs' posts… (${done}/${candidates.length})`);
    const oomfHits = new Set();
    const oomf2Hits = new Set();
    const resonantLikers = new Set();
    for (const did of likers || []) {
      if (oomfSet.has(did)) {
        oomfHits.add(did);
        resonantLikers.add(did);
      } else if (oomfs2.has(did)) {
        oomf2Hits.add(did);
        resonantLikers.add(did);
      }
    }
    const resonance = oomfHits.size * 3 + oomf2Hits.size;
    return { ...post, oomfHits: oomfHits.size, oomf2Hits: oomf2Hits.size, resonance, resonantLikers };
  });

  return finalizeThreads(scored.filter(Boolean));
}

function finalizeThreads(scored) {
  scored.sort((a, b) => b.resonance - a.resonance);
  let picked = scored.filter((t) => t.resonance > 0).slice(0, MAX_NODES);
  if (picked.length < MIN_NODES) {
    const rest = scored.filter((t) => t.resonance === 0);
    picked = picked.concat(rest.slice(0, MIN_NODES - picked.length));
  }
  return picked;
}

export function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  const [small, big] = setA.size < setB.size ? [setA, setB] : [setB, setA];
  for (const x of small) if (big.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

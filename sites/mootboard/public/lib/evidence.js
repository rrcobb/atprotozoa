// evidence.js — turn a handle's moots into a pile of "evidence": real posts,
// pulled from several mutuals, filtered down to the suspiciously
// medium-liked middle of the pack (not the viral ones, not the ones nobody
// saw — the ones that seem normal, which is exactly what a conspiracy board
// wants).
import { moots, resolveDid } from "./moots.js";

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

// deterministic PRNG so a board is a pure function of {seed, handle} — a
// shared link reproduces the same picks and layout.
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Recent, non-reply, non-repost, text-bearing posts from one author.
async function fetchPosts(did, limit) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("filter", "posts_no_replies");
  let d;
  try {
    d = await jget(u.toString());
  } catch {
    return [];
  }
  const out = [];
  for (const item of d.feed || []) {
    if (item.reason) continue; // skip reposts — we want their own words
    const post = item.post;
    const text = post?.record?.text?.trim();
    if (!post || !text) continue;
    out.push({
      uri: post.uri,
      handleUrl: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`,
      text,
      likeCount: post.likeCount || 0,
      indexedAt: post.indexedAt,
      author: {
        did: post.author.did,
        handle: post.author.handle,
        displayName: post.author.displayName || post.author.handle,
        avatar: post.author.avatar || "",
      },
    });
  }
  return out;
}

// gatherEvidence(handle, { seed, onStep }) →
//   { did, self, moots: [profile...], evidence: [post...] }
export async function gatherEvidence(
  actorInput,
  { seed, onStep, mootCount = 7, perMootPosts = 25, boardSize = 9 } = {},
) {
  const rng = mulberry32(seed);

  const { did, self, pool } = await moots(actorInput, { onStep });
  if (!pool.length) {
    throw new Error("no moots to pull evidence from — that account follows nobody who follows back");
  }

  const chosen = seededShuffle(pool, rng).slice(0, Math.min(mootCount, pool.length));

  if (onStep) onStep(`reading ${chosen.length} moots' recent posts…`);
  const batches = await Promise.all(chosen.map((m) => fetchPosts(m.did, perMootPosts)));
  const postPool = batches.flat();

  if (postPool.length < 3) {
    throw new Error("not enough posts to build a case — try a handle with chattier moots");
  }

  if (onStep) onStep("finding the suspiciously medium-liked ones…");
  const sorted = postPool.slice().sort((a, b) => a.likeCount - b.likeCount);
  const n = sorted.length;
  // the middle band: skip the least-noticed quarter and the most-viral
  // quarter, keep the ones that look unremarkable — perfect cover.
  const lo = Math.floor(n * 0.25);
  const hi = Math.max(lo + 1, Math.ceil(n * 0.8));
  const band = sorted.slice(lo, hi);
  const source = band.length ? band : sorted;

  const picked = seededShuffle(source, rng).slice(0, Math.min(boardSize, source.length));

  return { did, self, moots: chosen, evidence: picked };
}

export { resolveDid };

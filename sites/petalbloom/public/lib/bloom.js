// bloom.js — everything that touches the network, plus the aggregation.
// Posts + counts come from the public AppView's author feed (the only place
// like/reply counts live), walked to exhaustion unless the visitor picks a
// smaller window. Who liked and who replied comes from Constellation
// (microcosm.js drop-in); reply text is hydrated with getPosts for sentiment.

import { likerDids, replyRecords, atUri } from "./microcosm.js";
import { classify } from "./sentiment.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";

async function xrpc(nsid, params) {
  const u = new URL(`${APPVIEW}/${nsid}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else u.searchParams.set(k, v);
  }
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(u);
    if (r.ok) return r.json();
    if (attempt < 3 && (r.status === 429 || r.status >= 500)) {
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      continue;
    }
    throw new Error(`${nsid} ${r.status}`);
  }
}

export const normalizeHandle = (s) => String(s || "").trim().replace(/^@+/, "").toLowerCase();

export const getProfile = (actor) => xrpc("app.bsky.actor.getProfile", { actor });

// maxPosts = 0 means everything. Pages until the cursor runs out; 100/page is
// the AppView's maximum.
export async function fetchPosts(did, maxPosts, onStep) {
  const posts = [];
  let cursor;
  for (;;) {
    const d = await xrpc("app.bsky.feed.getAuthorFeed", {
      actor: did, filter: "posts_no_replies", limit: 100, ...(cursor ? { cursor } : {}),
    });
    for (const item of d.feed || []) {
      const p = item.post;
      if (p.author.did !== did) continue; // reposts of others
      posts.push({
        uri: p.uri, text: (p.record && p.record.text) || "", at: p.record && p.record.createdAt || p.indexedAt,
        likes: p.likeCount || 0, replies: p.replyCount || 0, reposts: p.repostCount || 0, quotes: p.quoteCount || 0,
      });
    }
    onStep && onStep(posts.length);
    cursor = d.cursor;
    if (!cursor || !(d.feed || []).length) break;
    if (maxPosts && posts.length >= maxPosts) break;
  }
  return maxPosts ? posts.slice(0, maxPosts) : posts;
}

// Run fn over items with a fixed number in flight (Constellation and the
// AppView are shared services; 6 at once keeps us a polite client).
async function pool(items, size, fn, onStep) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { await fn(item); } catch (_) { /* one post failing shouldn't sink the bloom */ }
      onStep && onStep(++done, items.length);
    }
  }));
}

export async function fetchInteractions(did, posts, onStep) {
  const likes = []; // { did, post }
  const replies = []; // { did, uri, post }
  const liked = posts.filter((p) => p.likes > 0);
  const replied = posts.filter((p) => p.replies > 0);
  const total = liked.length + replied.length;
  let n = 0;
  const tick = () => onStep && onStep(++n, total);
  await pool(liked, 6, async (p) => {
    const dids = await likerDids(p.uri);
    for (const d of dids) likes.push({ did: d, post: p.uri });
  }, tick);
  await pool(replied, 6, async (p) => {
    const recs = await replyRecords(p.uri);
    for (const r of recs) if (r.collection === "app.bsky.feed.post") replies.push({ did: r.did, uri: atUri(r), post: p.uri });
  }, tick);
  return { likes, replies: replies.filter((r) => r.did !== did) };
}

export async function hydrateReplies(replies, onStep) {
  const chunks = [];
  for (let i = 0; i < replies.length; i += 25) chunks.push(replies.slice(i, i + 25));
  const byUri = new Map(replies.map((r) => [r.uri, r]));
  await pool(chunks, 4, async (chunk) => {
    const d = await xrpc("app.bsky.feed.getPosts", { uris: chunk.map((r) => r.uri) });
    for (const p of d.posts || []) {
      const r = byUri.get(p.uri);
      if (r) { r.text = (p.record && p.record.text) || ""; r.at = p.record && p.record.createdAt; r.mood = classify(r.text); }
    }
  }, onStep);
  for (const r of replies) if (!r.mood) { r.text = r.text || ""; r.mood = "neu"; } // deleted or unreadable
}

export async function hydrateProfiles(dids) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < dids.length; i += 25) chunks.push(dids.slice(i, i + 25));
  await pool(chunks, 4, async (chunk) => {
    const d = await xrpc("app.bsky.actor.getProfiles", { actors: chunk });
    for (const p of d.profiles || []) out.set(p.did, p);
  });
  return out;
}

// Per-account tally. Warmth: a like is 1, a positive reply 3, a neutral reply
// 1.5, a negative reply 0 — the bloom is about the people who show up kindly.
export const WEIGHTS = { like: 1, pos: 3, neu: 1.5, neg: 0 };

export function tally(likes, replies) {
  const m = new Map();
  const row = (did) => {
    if (!m.has(did)) m.set(did, { did, likes: 0, pos: 0, neu: 0, neg: 0, score: 0 });
    return m.get(did);
  };
  for (const l of likes) row(l.did).likes++;
  for (const r of replies) row(r.did)[r.mood]++;
  for (const a of m.values()) a.score = a.likes * WEIGHTS.like + a.pos * WEIGHTS.pos + a.neu * WEIGHTS.neu;
  return [...m.values()].filter((a) => a.score > 0).sort((a, b) => b.score - a.score);
}

// quiet.js — find which of a set of "mutual" DIDs have liked or replied to
// any of the target's own posts within a time window. There's no anonymous
// "who liked this account" endpoint, so the approach (same trick as
// metamoots/lib/crawl.js's crawlInbound) is: page the target's own recent
// posts via getAuthorFeed, stop once posts fall outside the window, then for
// each sampled post pull its likers and its direct getPostThread replies.
// Every liker/replier that's in the mutual set gets marked "engaged" —
// whoever's left in the mutual set at the end is quiet.
//
// Likers come from microcosm.blue's Constellation
// (blue.microcosm.links.getBacklinkDids, source app.bsky.feed.like:subject.uri),
// with getLikes as the fallback. This is a correctness fix, not just a
// cheaper read: the old code took getLikes' first page of 100 and stopped,
// so on any post with more than 100 likes a mutual whose like landed past
// position 100 was invisible and got called quiet. Constellation returns
// every liker, 1000 per page. Gotchas in notes/40-new-site-playbook.md.
//
// Deliberately ignores reposts: the ask is specifically about liking or
// replying, and a repost is a much lower-effort, more public-facing signal
// that doesn't really speak to whether someone's still paying attention to
// the target as a person.

import { jget, pooledEach } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";
const CONSTELLATION = "https://constellation.microcosm.blue";

const AUTHOR_FEED_PAGES = 8; // hard cap regardless of window, so a very prolific poster can't run away
const MAX_SAMPLED_POSTS = 60;
const POST_CONCURRENCY = 5;
const MAX_CONSTELLATION_PAGES = 50; // backstop only — 50,000 likers on one post
const MAX_LIKE_PAGES = 500; // same ceiling for the fallback walk, at 100/page

// The target's own original posts (skipping reposts of others) within
// `sinceMs`, most recent first, capped at MAX_SAMPLED_POSTS. Stops paging
// as soon as a post falls outside the window, since getAuthorFeed is
// reverse-chronological — cheaper than metamoots' fixed page count when the
// window is short relative to posting frequency.
async function sampleOwnPosts(did, sinceMs) {
  const posts = [];
  let cursor = "";
  for (let p = 0; p < AUTHOR_FEED_PAGES && posts.length < MAX_SAMPLED_POSTS; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    let ranOffWindow = false;
    for (const item of d.feed || []) {
      const post = item.post;
      if (!post || !post.author || post.author.did !== did) continue; // skip reposts of others
      if (item.reason) continue; // a repost surfaced in the feed, not an original/reply post
      const createdAt = Date.parse((post.record && post.record.createdAt) || post.indexedAt || 0);
      if (Number.isFinite(createdAt) && createdAt < sinceMs) {
        ranOffWindow = true;
        break;
      }
      posts.push(post.uri);
      if (posts.length >= MAX_SAMPLED_POSTS) break;
    }
    if (ranOffWindow) break;
    cursor = d.cursor;
    if (!cursor) break;
  }
  return posts;
}

// Every liker of a post as a list of DIDs. Constellation first, exhausted to
// the end of the cursor; throws on a failed page so the caller falls back to
// the AppView walk rather than treating a short read as the whole list.
async function likerDidsConstellation(uri) {
  const dids = [];
  let cursor = "";
  for (let p = 0; p < MAX_CONSTELLATION_PAGES; p++) {
    const u = new URL(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinkDids`);
    u.searchParams.set("subject", uri);
    u.searchParams.set("source", "app.bsky.feed.like:subject.uri");
    u.searchParams.set("limit", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    const batch = d.linking_dids || [];
    for (const did of batch) dids.push(did);
    cursor = d.cursor;
    if (!cursor || !batch.length) break;
  }
  return dids;
}

// Fallback: getLikes, now paged to the end of the cursor rather than
// stopping after the first 100.
async function likerDidsAppView(uri) {
  const dids = [];
  let cursor = "";
  for (let p = 0; p < MAX_LIKE_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getLikes`);
    u.searchParams.set("uri", uri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const l of d.likes || []) {
      const liker = l.actor && l.actor.did;
      if (liker) dids.push(liker);
    }
    cursor = d.cursor;
    if (!cursor || !(d.likes || []).length) break;
  }
  return dids;
}

async function likerDids(uri) {
  try {
    return await likerDidsConstellation(uri);
  } catch {
    return likerDidsAppView(uri);
  }
}

// Returns { engaged: Set<did>, sampledPostCount }. `engaged` only ever
// contains DIDs present in `mutualSet` — everyone else's likes/replies are
// dropped as they're read, since purge only cares about the mutual set.
export async function crawlQuietMutuals(did, mutualSet, sinceMs, { onStep, onProgress } = {}) {
  if (onStep) onStep("sampling their recent posts…");
  const posts = await sampleOwnPosts(did, sinceMs);

  const engaged = new Set();
  let done = 0;
  await pooledEach(posts, POST_CONCURRENCY, async (uri) => {
    const u = encodeURIComponent(uri);
    const [likers, threadRes] = await Promise.all([
      likerDids(uri).catch(() => []),
      jget(`${PUB}/app.bsky.feed.getPostThread?uri=${u}&depth=1&parentHeight=0`).catch(() => null),
    ]);
    for (const liker of likers) {
      if (mutualSet.has(liker)) engaged.add(liker);
    }
    const replies = (threadRes && threadRes.thread && threadRes.thread.replies) || [];
    for (const r of replies) {
      const replier = r.post && r.post.author && r.post.author.did;
      if (replier && mutualSet.has(replier)) engaged.add(replier);
    }
    done++;
    if (onProgress) onProgress(done, posts.length);
  });

  return { engaged, sampledPostCount: posts.length };
}

// crawl.js — gather engagement between the target account and everyone
// *outside* their follow graph, in both directions:
//
//   outbound (target -> candidate): read the target's own like/repost/post
//   records straight off their own PDS (com.atproto.repo.listRecords, same
//   trick as cloutgraph/lib/likes.js — these are ordinary public repo
//   records, no auth needed) and pull out who they liked, reposted, replied
//   to, and quoted.
//
//   inbound (candidate -> target): there's no anonymous "who liked this
//   account" endpoint, but there IS a public per-post one
//   (app.bsky.feed.getLikes / getRepostedBy), and a public thread endpoint
//   for direct replies (app.bsky.feed.getPostThread). So: fetch the
//   target's own recent posts via getAuthorFeed, then for each one pull its
//   likers, reposters, and direct repliers.
//
// Both directions are restricted to candidates outside `exclude` (the
// target + their follows + their followers) as they're collected, so
// accounts already in a follow relationship never even get counted.

import { jget, resolvePds, authorFromUri, pooledEach } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";

const LIKE_PAGES = 5; // <= 500 recent likes read off the target's own PDS
const REPOST_PAGES = 3; // <= 300 recent reposts
const POST_PAGES = 5; // <= 500 recent posts (source of replies + quotes given)
const AUTHOR_FEED_PAGES = 4; // pages of getAuthorFeed scanned to find the target's own posts
const MAX_SAMPLED_POSTS = 30; // how many of the target's own posts get inbound-crawled
const POST_CONCURRENCY = 5;

async function listOwnRecords(did, pds, collection, maxPages) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < maxPages; p++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", collection);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const rec of d.records || []) out.push(rec);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

function bump(map, did, field, by) {
  if (!did) return;
  let row = map.get(did);
  if (!row) {
    row = { likesGiven: 0, repostsGiven: 0, repliesGiven: 0, quotesGiven: 0, likesReceived: 0, repostsReceived: 0, repliesReceived: 0 };
    map.set(did, row);
  }
  row[field] += by;
}

// target -> candidate: likes, reposts, replies, quotes given, read straight
// off the target's own repo.
async function crawlOutbound(did, pds, exclude, out, onStep) {
  if (onStep) onStep("reading who they liked…");
  const likes = await listOwnRecords(did, pds, "app.bsky.feed.like", LIKE_PAGES);
  for (const rec of likes) {
    const author = authorFromUri(rec.value && rec.value.subject && rec.value.subject.uri);
    if (author && author !== did && !exclude.has(author)) bump(out, author, "likesGiven", 1);
  }

  if (onStep) onStep("reading who they reposted…");
  const reposts = await listOwnRecords(did, pds, "app.bsky.feed.repost", REPOST_PAGES);
  for (const rec of reposts) {
    const author = authorFromUri(rec.value && rec.value.subject && rec.value.subject.uri);
    if (author && author !== did && !exclude.has(author)) bump(out, author, "repostsGiven", 1);
  }

  if (onStep) onStep("reading their replies and quotes…");
  const posts = await listOwnRecords(did, pds, "app.bsky.feed.post", POST_PAGES);
  for (const rec of posts) {
    const v = rec.value || {};
    if (v.reply && v.reply.parent) {
      const author = authorFromUri(v.reply.parent.uri);
      if (author && author !== did && !exclude.has(author)) bump(out, author, "repliesGiven", 1);
    }
    const embed = v.embed || {};
    const quoted =
      (embed.$type === "app.bsky.embed.record" && embed.record) ||
      (embed.$type === "app.bsky.embed.recordWithMedia" && embed.record && embed.record.record);
    if (quoted && quoted.uri) {
      const author = authorFromUri(quoted.uri);
      if (author && author !== did && !exclude.has(author)) bump(out, author, "quotesGiven", 1);
    }
  }
}

// The target's own recent posts (excluding reposts of other people that
// show up in their author feed), most recent first, capped at
// MAX_SAMPLED_POSTS.
async function sampleOwnPosts(did) {
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
    for (const item of d.feed || []) {
      const post = item.post;
      if (!post || !post.author || post.author.did !== did) continue; // skip reposts of others
      if (item.reason) continue; // a repost surfaced in the feed, not an original/reply post
      posts.push(post.uri);
      if (posts.length >= MAX_SAMPLED_POSTS) break;
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return posts;
}

// candidate -> target: who liked, reposted, and directly replied to the
// target's sampled posts.
async function crawlInbound(did, exclude, out, onProgress) {
  const posts = await sampleOwnPosts(did);
  let done = 0;
  await pooledEach(posts, POST_CONCURRENCY, async (uri) => {
    const u = encodeURIComponent(uri);
    const [likesRes, repostsRes, threadRes] = await Promise.all([
      jget(`${PUB}/app.bsky.feed.getLikes?uri=${u}&limit=100`).catch(() => null),
      jget(`${PUB}/app.bsky.feed.getRepostedBy?uri=${u}&limit=100`).catch(() => null),
      jget(`${PUB}/app.bsky.feed.getPostThread?uri=${u}&depth=1&parentHeight=0`).catch(() => null),
    ]);
    for (const l of (likesRes && likesRes.likes) || []) {
      const author = l.actor && l.actor.did;
      if (author && author !== did && !exclude.has(author)) bump(out, author, "likesReceived", 1);
    }
    for (const r of (repostsRes && repostsRes.repostedBy) || []) {
      const author = r.did;
      if (author && author !== did && !exclude.has(author)) bump(out, author, "repostsReceived", 1);
    }
    const replies = (threadRes && threadRes.thread && threadRes.thread.replies) || [];
    for (const r of replies) {
      const author = r.post && r.post.author && r.post.author.did;
      if (author && author !== did && !exclude.has(author)) bump(out, author, "repliesReceived", 1);
    }
    done++;
    if (onProgress) onProgress(done, posts.length);
  });
  return posts.length;
}

// Crawl both directions and return a Map<did, counts>. `counts` has
// likesGiven/repostsGiven/repliesGiven/quotesGiven (target -> candidate)
// and likesReceived/repostsReceived/repliesReceived (candidate -> target).
export async function crawlEngagement(did, exclude, { onStep } = {}) {
  const out = new Map();
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find that account's PDS");

  await crawlOutbound(did, pds, exclude, out, onStep);

  if (onStep) onStep("sampling their recent posts…");
  const sampledCount = await crawlInbound(did, exclude, out, (done, total) =>
    onStep && onStep(`reading who engaged with their posts: ${done}/${total}…`),
  );

  return { candidates: out, sampledPostCount: sampledCount };
}

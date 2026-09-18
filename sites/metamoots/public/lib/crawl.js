// crawl.js — gather engagement between the target account and everyone
// *outside* their follow graph, in both directions:
//
//   outbound (target -> candidate): read the target's own like/repost/post
//   records straight off their own PDS. One com.atproto.sync.getRepo CAR
//   download gets all three collections at once (see lib/car.js); falls back
//   to three separate com.atproto.repo.listRecords walks (same trick as
//   cloutgraph/lib/likes.js — these are ordinary public repo records, no auth
//   needed) if the CAR path fails. Either way, pull out who they liked,
//   reposted, replied to, and quoted.
//
//   inbound (candidate -> target): there's no anonymous "who liked this
//   account" endpoint, but per-post backlinks answer the same question.
//   Likers and reposters come from microcosm.blue's Constellation
//   (blue.microcosm.links.getBacklinkDids, sources
//   app.bsky.feed.like:subject.uri and app.bsky.feed.repost:subject.uri),
//   which returns 1000 DIDs per page and the whole list; the AppView's
//   getLikes/getRepostedBy stay as the fallback. Direct replies still come
//   from the public thread endpoint (app.bsky.feed.getPostThread). So:
//   fetch the target's own recent posts via getAuthorFeed, then for each
//   one pull its likers, reposters, and direct repliers.
//
//   The AppView reads here took one page of 100 and stopped, so a popular
//   post's engagement tailed off into nothing and candidates were
//   undercounted. Only the DID is ever used, so nothing is lost by
//   dropping the hydrated actor. Gotchas in notes/40-new-site-playbook.md.
//
// Both directions are restricted to candidates outside `exclude` (the
// target + their follows + their followers) as they're collected, so
// accounts already in a follow relationship never even get counted.

import { jget, resolvePds, authorFromUri, pooledEach } from "./identity.js";
import { fetchRepoRecords } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const CONSTELLATION = "https://constellation.microcosm.blue";

const LIKE_PAGES = 5; // <= 500 recent likes read off the target's own PDS
const REPOST_PAGES = 3; // <= 300 recent reposts
const POST_PAGES = 5; // <= 500 recent posts (source of replies + quotes given)
const AUTHOR_FEED_PAGES = 4; // pages of getAuthorFeed scanned to find the target's own posts
const MAX_SAMPLED_POSTS = 30; // how many of the target's own posts get inbound-crawled
const POST_CONCURRENCY = 5;
const MAX_CONSTELLATION_PAGES = 50; // backstop only — 50,000 engagers on one post
const MAX_APPVIEW_PAGES = 500; // same ceiling for the fallback walks, at 100/page

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

// Tally one decoded like/repost/post record's outbound engagement into `out`.
// Shared between the CAR path and the per-collection listRecords fallback
// below — a CAR block decodes straight to the record body (no `.value`
// wrapper), so callers pass that body directly.
function tallyOutbound(v, did, exclude, out) {
  if (v.$type === "app.bsky.feed.like") {
    const author = authorFromUri(v.subject && v.subject.uri);
    if (author && author !== did && !exclude.has(author)) bump(out, author, "likesGiven", 1);
    return;
  }
  if (v.$type === "app.bsky.feed.repost") {
    const author = authorFromUri(v.subject && v.subject.uri);
    if (author && author !== did && !exclude.has(author)) bump(out, author, "repostsGiven", 1);
    return;
  }
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

// Fallback: three separate paginated listRecords walks (likes, reposts,
// posts), each capped — used only when the single CAR download in
// crawlOutbound below fails (parse error, oversized repo, a PDS that blocks
// sync.getRepo).
async function crawlOutboundViaRepo(did, pds, exclude, out, onStep) {
  if (onStep) onStep("reading who they liked…");
  const likes = await listOwnRecords(did, pds, "app.bsky.feed.like", LIKE_PAGES);
  for (const rec of likes) tallyOutbound(rec.value || {}, did, exclude, out);

  if (onStep) onStep("reading who they reposted…");
  const reposts = await listOwnRecords(did, pds, "app.bsky.feed.repost", REPOST_PAGES);
  for (const rec of reposts) tallyOutbound(rec.value || {}, did, exclude, out);

  if (onStep) onStep("reading their replies and quotes…");
  const posts = await listOwnRecords(did, pds, "app.bsky.feed.post", POST_PAGES);
  for (const rec of posts) tallyOutbound(rec.value || {}, did, exclude, out);
}

// target -> candidate: likes, reposts, replies, quotes given, read straight
// off the target's own repo. Tries one com.atproto.sync.getRepo CAR download
// first — every like/repost/post record in a single request, rather than
// three separate paginated listRecords walks each capped short of the
// target's whole history — falling back to crawlOutboundViaRepo if the CAR
// path fails.
async function crawlOutbound(did, pds, exclude, out, onStep) {
  if (onStep) onStep("downloading their repo…");
  try {
    const { records } = await fetchRepoRecords(pds, did, [
      "app.bsky.feed.like",
      "app.bsky.feed.repost",
      "app.bsky.feed.post",
    ]);
    for (const v of records) tallyOutbound(v, did, exclude, out);
  } catch {
    await crawlOutboundViaRepo(did, pds, exclude, out, onStep);
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

// Engager DIDs for one post from Constellation, paged to the end of the
// cursor. Throws on a failed page so the caller can fall back to the
// AppView walk instead of counting a partial list.
async function engagerDidsConstellation(uri, source) {
  const dids = [];
  const seen = new Set();
  let cursor = "";
  for (let p = 0; p < MAX_CONSTELLATION_PAGES; p++) {
    const u = new URL(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinkDids`);
    u.searchParams.set("subject", uri);
    u.searchParams.set("source", source);
    u.searchParams.set("limit", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    const batch = d.linking_dids || [];
    for (const did of batch) {
      if (seen.has(did)) continue;
      seen.add(did);
      dids.push(did);
    }
    cursor = d.cursor;
    if (!cursor || !batch.length) break;
  }
  return dids;
}

// Fallback: the AppView endpoint, paged to the end of the cursor rather
// than stopping after the first 100. `key`/`pick` differ between getLikes
// (likes[].actor.did) and getRepostedBy (repostedBy[].did).
async function engagerDidsAppView(uri, endpoint, key, pick) {
  const dids = [];
  let cursor = "";
  for (let p = 0; p < MAX_APPVIEW_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("uri", uri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const batch = d[key] || [];
    for (const item of batch) {
      const did = pick(item);
      if (did) dids.push(did);
    }
    cursor = d.cursor;
    if (!cursor || !batch.length) break;
  }
  return dids;
}

async function likerDids(uri) {
  try {
    return await engagerDidsConstellation(uri, "app.bsky.feed.like:subject.uri");
  } catch {
    return engagerDidsAppView(uri, "app.bsky.feed.getLikes", "likes", (l) => l.actor && l.actor.did);
  }
}

async function reposterDids(uri) {
  try {
    return await engagerDidsConstellation(uri, "app.bsky.feed.repost:subject.uri");
  } catch {
    return engagerDidsAppView(uri, "app.bsky.feed.getRepostedBy", "repostedBy", (r) => r.did);
  }
}

// candidate -> target: who liked, reposted, and directly replied to the
// target's sampled posts.
async function crawlInbound(did, exclude, out, onProgress) {
  const posts = await sampleOwnPosts(did);
  let done = 0;
  await pooledEach(posts, POST_CONCURRENCY, async (uri) => {
    const u = encodeURIComponent(uri);
    const [likers, reposters, threadRes] = await Promise.all([
      likerDids(uri).catch(() => []),
      reposterDids(uri).catch(() => []),
      jget(`${PUB}/app.bsky.feed.getPostThread?uri=${u}&depth=1&parentHeight=0`).catch(() => null),
    ]);
    for (const author of likers) {
      if (author && author !== did && !exclude.has(author)) bump(out, author, "likesReceived", 1);
    }
    for (const author of reposters) {
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

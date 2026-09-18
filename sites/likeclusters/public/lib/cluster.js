// cluster.js — sample every one of an account's own posts, read each one's public
// likers, and group the likers by which rough topic (keyword/hashtag
// signature, see keywords.js) they actually show up for. Modeled on
// metamoots/lib/crawl.js's crawlInbound (same "no anonymous who-liked-this-
// account endpoint, so sample the target's own posts and read each one's
// getLikes" trick) but this site only needs the inbound half, and needs the
// post *text* too (crawlInbound only needed the author).
//
// Likers come from microcosm.blue's Constellation first
// (blue.microcosm.links.getBacklinkDids, source app.bsky.feed.like:subject.uri):
// it returns 1000 liker DIDs per page against getLikes' 100, and this site
// only ever keeps the DID, so nothing is lost by dropping the AppView's
// hydrated actor. getLikes stays as the fallback when Constellation errors —
// same recipe as listenheimer/public/lib/likes.js, gotchas in notes/40.

import { jget, pooledEach } from "./identity.js";
import { termCounts, scorePostTerms, topTags } from "./keywords.js";

const PUB = "https://api.bsky.app/xrpc";
const CONSTELLATION = "https://constellation.microcosm.blue";

// No page/post caps by design — sample every original post the account has,
// paging getAuthorFeed until its cursor runs out. These are safety ceilings
// only, so one absurdly prolific account can't hang the tab forever; nobody
// normal will ever hit them.
const MAX_FEED_PAGES = 500; // hard stop on getAuthorFeed pagination
const MAX_SAMPLED_POSTS = 20000; // hard stop on how many own posts get read for likers
const MAX_LIKE_PAGES_PER_POST = 500; // hard stop on getLikes pagination per post (<= 50000 likers)
const MAX_CONSTELLATION_PAGES_PER_POST = 50; // same ceiling in 1000-DID pages (<= 50000 likers)
const POST_CONCURRENCY = 6;
const TAGS_PER_POST = 3; // top topic tags kept per post
const MIN_LIKES_TO_RANK = 2; // a liker needs at least this many liked posts to get a topic verdict

// Every one of the target's own posts (excluding reposts of other people
// that show up in their author feed), most recent first, paged until
// getAuthorFeed's cursor runs out (or a safety ceiling hits). Returns
// { uri, text, likeCount }.
export async function sampleOwnPosts(did, onStep) {
  const posts = [];
  let cursor = "";
  for (let p = 0; p < MAX_FEED_PAGES && posts.length < MAX_SAMPLED_POSTS; p++) {
    if (onStep) onStep(`reading their posts… (${posts.length} so far)`);
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
      posts.push({
        uri: post.uri,
        text: (post.record && post.record.text) || "",
        likeCount: post.likeCount || 0,
      });
      if (posts.length >= MAX_SAMPLED_POSTS) break;
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return posts;
}

// Read the public likers of every sampled post, exhausted to the end of the
// cursor rather than a fixed slice. Returns Map<did, { count, uris:
// string[] }> — how many of the target's sampled posts each liker showed up
// on, and which ones.
async function crawlLikers(posts, onProgress) {
  const out = new Map();
  let done = 0;
  await pooledEach(posts, POST_CONCURRENCY, async (post) => {
    let dids;
    try {
      dids = await likerDidsConstellation(post.uri);
    } catch {
      dids = await likerDidsAppView(post.uri);
    }
    for (const liker of dids) {
      let row = out.get(liker);
      if (!row) {
        row = { count: 0, uris: [] };
        out.set(liker, row);
      }
      row.count += 1;
      row.uris.push(post.uri);
    }
    done++;
    if (onProgress) onProgress(done, posts.length);
  });
  return out;
}

// Liker DIDs for one post from Constellation, deduped, paged to the end of
// the cursor. Throws if any page fails, so the caller can fall back to the
// AppView walk for that post rather than counting a partial list.
async function likerDidsConstellation(uri) {
  const dids = [];
  const seen = new Set();
  let cursor = "";
  for (let p = 0; p < MAX_CONSTELLATION_PAGES_PER_POST; p++) {
    const u = new URL(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinkDids`);
    u.searchParams.set("subject", uri);
    u.searchParams.set("source", "app.bsky.feed.like:subject.uri");
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

// Fallback: the AppView's getLikes walk, 100 per page. Swallows a failed
// page (returning what it has) the way this crawl always has — one
// unreadable post shouldn't sink the whole cluster run.
async function likerDidsAppView(uri) {
  const dids = [];
  let cursor = "";
  for (let p = 0; p < MAX_LIKE_PAGES_PER_POST; p++) {
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
    if (!cursor) break;
  }
  return dids;
}

// Full pipeline: sample posts, score their topic terms, crawl likers, and
// build a per-liker "topic verdict". Returns:
//   { posts, postTags: Map<uri, [term, score][]>, likers: [...], tagGroups: Map<term, likers[]> }
// Each liker row: { did, count, topTag, topWeight, totalWeight, focus,
//   tagBreakdown: [term, weight][] }. `focus` is topWeight / totalWeight —
// how concentrated a liker's likes are on their single biggest topic, 0..1.
// Likers under MIN_LIKES_TO_RANK are still returned (count/uris intact) but
// with topTag = null, since one liked post isn't enough to call a pattern.
export async function crawlAndCluster(did, { onStep } = {}) {
  const posts = await sampleOwnPosts(did, onStep);
  if (onStep) onStep(`sampled ${posts.length} posts — reading who liked each one…`);

  const countsByUri = new Map();
  for (const post of posts) countsByUri.set(post.uri, termCounts(post.text));
  const scoredByUri = scorePostTerms(countsByUri);
  const postTags = new Map();
  for (const post of posts) postTags.set(post.uri, topTags(scoredByUri.get(post.uri), TAGS_PER_POST));

  const likerRows = await crawlLikers(posts, (done, total) =>
    onStep && onStep(`reading who liked each post: ${done}/${total}…`),
  );

  const likers = [];
  const tagGroups = new Map();
  for (const [did_, row] of likerRows) {
    const tagWeight = new Map();
    for (const uri of row.uris) {
      for (const [term, score] of postTags.get(uri) || []) {
        tagWeight.set(term, (tagWeight.get(term) || 0) + score);
      }
    }
    const breakdown = [...tagWeight.entries()].sort((a, b) => b[1] - a[1]);
    const totalWeight = breakdown.reduce((s, [, w]) => s + w, 0);
    const top = breakdown[0] || null;
    const eligible = row.count >= MIN_LIKES_TO_RANK && top && totalWeight > 0;

    const liker = {
      did: did_,
      count: row.count,
      uris: row.uris,
      tagBreakdown: breakdown,
      totalWeight,
      topTag: eligible ? top[0] : null,
      topWeight: eligible ? top[1] : 0,
      focus: eligible ? top[1] / totalWeight : 0,
    };
    likers.push(liker);

    if (eligible) {
      if (!tagGroups.has(top[0])) tagGroups.set(top[0], []);
      tagGroups.get(top[0]).push(liker);
    }
  }

  likers.sort((a, b) => b.count - a.count);
  for (const group of tagGroups.values()) group.sort((a, b) => b.focus - a.focus || b.count - a.count);

  return { posts, postTags, likers, tagGroups };
}

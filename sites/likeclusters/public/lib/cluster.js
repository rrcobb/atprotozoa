// cluster.js — sample an account's own recent posts, read each one's public
// likers, and group the likers by which rough topic (keyword/hashtag
// signature, see keywords.js) they actually show up for. Modeled on
// metamoots/lib/crawl.js's crawlInbound (same "no anonymous who-liked-this-
// account endpoint, so sample the target's own posts and read each one's
// getLikes" trick) but this site only needs the inbound half, and needs the
// post *text* too (crawlInbound only needed the author).

import { jget, pooledEach } from "./identity.js";
import { termCounts, scorePostTerms, topTags } from "./keywords.js";

const PUB = "https://api.bsky.app/xrpc";

const AUTHOR_FEED_PAGES = 6; // pages of getAuthorFeed scanned for the target's own posts
const MAX_SAMPLED_POSTS = 60; // how many of the target's own posts get read for likers
const LIKE_PAGES_PER_POST = 2; // <= 200 likers read per post
const POST_CONCURRENCY = 6;
const TAGS_PER_POST = 3; // top topic tags kept per post
const MIN_LIKES_TO_RANK = 2; // a liker needs at least this many liked posts to get a topic verdict

// The target's own recent posts (excluding reposts of other people that
// show up in their author feed), most recent first, capped at
// MAX_SAMPLED_POSTS. Returns { uri, text, likeCount }.
export async function sampleOwnPosts(did, onStep) {
  const posts = [];
  let cursor = "";
  for (let p = 0; p < AUTHOR_FEED_PAGES && posts.length < MAX_SAMPLED_POSTS; p++) {
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

// Read the public likers of every sampled post. Returns Map<did, { count,
// uris: string[] }> — how many of the target's sampled posts each liker
// showed up on, and which ones.
async function crawlLikers(posts, onProgress) {
  const out = new Map();
  let done = 0;
  await pooledEach(posts, POST_CONCURRENCY, async (post) => {
    let cursor = "";
    for (let p = 0; p < LIKE_PAGES_PER_POST; p++) {
      const u = new URL(`${PUB}/app.bsky.feed.getLikes`);
      u.searchParams.set("uri", post.uri);
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
        if (!liker) continue;
        let row = out.get(liker);
        if (!row) {
          row = { count: 0, uris: [] };
          out.set(liker, row);
        }
        row.count += 1;
        row.uris.push(post.uri);
      }
      cursor = d.cursor;
      if (!cursor) break;
    }
    done++;
    if (onProgress) onProgress(done, posts.length);
  });
  return out;
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

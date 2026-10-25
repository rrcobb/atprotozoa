// search.js — keyword search via the public AppView, scoped per-account.
//   SEARCH (api.bsky.app) — searchPosts. public.api.bsky.app 403s search, but
//     api.bsky.app serves it unauthenticated with CORS * (see
//     notes/history/trigrams-reply-and-quiver.md's "HAMMERED" test). No worker
//     needed for a handle-scoped tool like this one.
//
// Originally this scanned the global, recency-sorted firehose (q=phrase, no
// author filter) and intersected each page against the cluster's DID set.
// That looked reasonable but was actually broken for any common word: a
// "sort=latest" scan only ever sees the last N posts *bluesky-wide*, and for
// something like "vote" that's a window of a few minutes of the entire
// network's traffic, not a meaningful sample of a few hundred cluster
// members' post history. Reported 2026-09-05 (@fromthewestmeadow.com: search
// for "vote" found nothing in their simcluster) — the site was quietly
// unable to find anything that wasn't posted in roughly the last minute.
//
// Fixed by searching each cluster member's own history directly:
// searchPosts supports an `author` filter, so we run one exact, exhaustive
// query per account instead of sampling the global stream and hoping.

const SEARCH = "https://api.bsky.app/xrpc";

// searchPosts with retry/backoff — api.bsky.app soft-403s/429s under bursty
// load (a real, documented behavior — see sites/trigrams/public/lib/unique.js
// — not a permanent block). Both must be retried with backoff; only other
// 4xx are real errors.
async function searchGet(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return await r.json();
      const soft = r.status === 429 || r.status === 403 || r.status >= 500;
      if (!soft) return null;
      const ra = parseInt(r.headers.get("retry-after") || "", 10);
      await new Promise((res) =>
        setTimeout(res, ra ? ra * 1000 : 600 * (i + 1) + 350 * i * i),
      );
    } catch {
      await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
  }
  return null;
}

// A runaway-loop safety valve, not a data cap: one account's own posts
// matching one phrase are inherently finite, so this loop already stops
// itself via the cursor. 50 pages (5,000 matches from one person for one
// phrase) is far past anything real; it only exists so a malformed cursor
// can't spin forever.
const AUTHOR_SEARCH_SAFETY_PAGES = 50;

// Search a single account's own post history for `phrase`, exhaustively.
// Exact and complete for that account — not a sample of the global stream.
export async function searchAuthorPhrase(phrase, did) {
  const posts = [];
  let cursor = "";
  for (let page = 0; page < AUTHOR_SEARCH_SAFETY_PAGES; page++) {
    const u = new URL(`${SEARCH}/app.bsky.feed.searchPosts`);
    u.searchParams.set("q", phrase);
    u.searchParams.set("author", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);

    const d = await searchGet(u.toString());
    if (!d) break;
    const recs = d.posts || [];
    for (const p of recs) {
      const rec = p.record || {};
      posts.push({
        uri: p.uri,
        author: p.author || {},
        // alt text counts: the thread that asked for this was an image post.
        text: [rec.text || "", ...altTexts(p)].filter(Boolean).join("\n"),
        images: thumbs(p),
        createdAt: rec.createdAt || p.indexedAt,
        likeCount: p.likeCount || 0,
        repostCount: p.repostCount || 0,
      });
    }
    cursor = d.cursor;
    if (!cursor || recs.length === 0) break;
  }
  return posts;
}

function altTexts(p) {
  const e = p.embed || {};
  const imgs = e.images || (e.media && e.media.images) || [];
  return imgs.map((i) => i.alt).filter(Boolean);
}

// Thumbnail URLs of a post's attached images (cdn.bsky.app, CORS-open), for
// the optional in-browser photo reader.
function thumbs(p) {
  const e = p.embed || {};
  const imgs = e.images || (e.media && e.media.images) || [];
  return imgs.map((i) => i.fullsize || i.thumb).filter(Boolean);
}

// bsky.app permalink from an at:// uri (works with a DID identifier too, no
// handle lookup needed).
export function postUrl(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

// Every media post (images attached) in one account's feed, for the photo
// pass: a hot dog photo with no hot dog words in its text or alt text is
// invisible to searchPosts. getAuthorFeed's posts_with_media filter walks the
// account's whole feed, so this pages until the cursor is empty. Small thumbs
// are enough for CLIP (it downsizes to 224px anyway).
const FEED = "https://public.api.bsky.app/xrpc";
const FEED_SAFETY_PAGES = 400; // runaway-loop guard only; 40,000 media posts from one account is unreachable

export async function mediaPostsForAuthor(did) {
  const posts = [];
  let cursor = "";
  for (let page = 0; page < FEED_SAFETY_PAGES; page++) {
    const u = new URL(`${FEED}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("filter", "posts_with_media");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await searchGet(u.toString());
    if (!d) break;
    const feed = d.feed || [];
    for (const item of feed) {
      const p = item.post;
      if (!p || item.reason || p.author?.did !== did) continue; // skip reposts of others
      const imgs = ((p.embed?.images) || (p.embed?.media?.images) || []).map((i) => i.thumb || i.fullsize).filter(Boolean);
      if (!imgs.length) continue;
      const rec = p.record || {};
      posts.push({
        uri: p.uri,
        author: p.author,
        text: [rec.text || "", ...altTexts(p)].filter(Boolean).join("\n"),
        images: imgs,
        createdAt: rec.createdAt || p.indexedAt,
        likeCount: p.likeCount || 0,
        repostCount: p.repostCount || 0,
      });
    }
    cursor = d.cursor;
    if (!cursor || feed.length === 0) break;
  }
  return posts;
}

// bsky.js — isopod's search helper. Copied+trimmed from
// sites/patientzero/public/lib/search.js's lineage (copy, don't abstract).
//   Anonymous app.bsky.feed.searchPosts on api.bsky.app is administratively
//   blocked at volume (403 "forbidden by administrative rules" — see
//   notes/71 and sites/trigrams/src/index.ts's handleSearch comment). So
//   this hits sites/trigrams's already-authenticated /api/search proxy
//   instead — it's CORS-open by design for exactly this, no credentials of
//   our own needed.

const SEARCH_API = "https://trigrams.bisks.net/api/search";

// searchPosts with retry/backoff — api.bsky.app soft-403s/429s under bursty
// load (a real, documented behavior, not a permanent block). Both must be
// retried with backoff; only other 4xx are real errors.
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

// One page of searchPosts, sorted "top" (the AppView's own relevance+
// engagement ranking) for `q`. Returns [] on total failure — caller treats
// that the same as "no results this round," not a hard error.
export async function searchTop(q, limit = 25) {
  const u = new URL(SEARCH_API);
  u.searchParams.set("q", q);
  u.searchParams.set("sort", "top");
  u.searchParams.set("limit", String(limit));
  const d = await searchGet(u.toString());
  return d?.posts || [];
}

// bsky.app permalink from an at:// uri.
export function postUrl(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

export function engagement(post) {
  return (post.likeCount || 0) + (post.repostCount || 0) * 2 + (post.replyCount || 0);
}

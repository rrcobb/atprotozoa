// search.js — keyword search via the public AppView, newest-first, resumable
// by cursor. Copied and trimmed from sites/notasexthing/public/lib/bsky.js's
// scanPhrase (copy, don't abstract), tracing back to crosstag/public/lib/bsky.js.
//   SEARCH (api.bsky.app) — searchPosts. public.api.bsky.app 403s search, but
//     api.bsky.app serves it unauthenticated with CORS * (see
//     notes/history/trigrams-reply-and-quiver.md's "HAMMERED" test). No worker
//     needed for a handle-scoped tool like this one.

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

// Pages through searchPosts for `phrase`, newest-first, calling onPage after
// each page so a caller can filter-as-it-goes (e.g. down to a cluster's
// member DIDs) and update a live counter. Stops after maxPages or when the
// AppView runs out of cursor; returns the cursor so the caller can keep
// scanning further back on demand — no fixed ceiling on total pages scanned,
// just a per-call batch size, so "keep going" is a button, not a wall.
export async function scanPhrase(
  phrase,
  { cursor = "", maxPages = 20, onPage } = {},
) {
  const posts = [];
  let pages = 0;
  let nextCursor = cursor;

  for (; pages < maxPages; pages++) {
    const u = new URL(`${SEARCH}/app.bsky.feed.searchPosts`);
    u.searchParams.set("q", phrase);
    u.searchParams.set("sort", "latest");
    u.searchParams.set("limit", "100");
    if (nextCursor) u.searchParams.set("cursor", nextCursor);

    const d = await searchGet(u.toString());
    if (!d) break;
    const recs = d.posts || [];
    for (const p of recs) {
      const rec = p.record || {};
      posts.push({
        uri: p.uri,
        author: p.author || {},
        text: rec.text || "",
        createdAt: rec.createdAt || p.indexedAt,
        likeCount: p.likeCount || 0,
        repostCount: p.repostCount || 0,
      });
    }
    nextCursor = d.cursor;
    if (onPage) {
      onPage({
        page: pages + 1,
        pageCount: recs.length,
        scanned: posts.length,
        newPosts: posts.slice(posts.length - recs.length),
        done: !nextCursor || recs.length === 0,
      });
    }
    if (!nextCursor || recs.length === 0) {
      pages++;
      break;
    }
  }
  return { posts, cursor: nextCursor, pagesScanned: pages, exhausted: !nextCursor };
}

// bsky.app permalink from an at:// uri (works with a DID identifier too, no
// handle lookup needed).
export function postUrl(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

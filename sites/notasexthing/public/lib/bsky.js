// bsky.js — notasexthing's AppView search helper. Copied+trimmed from
// crosstag/public/lib/bsky.js's searchGet/scanCrosstags lineage (copy, don't
// abstract).
//   SEARCH (api.bsky.app) — searchPosts. public.api.bsky.app 403s search,
//     but api.bsky.app serves it unauthenticated with CORS * (verified in
//     notes/70-reply-and-rich.md's "HAMMERED" test). No worker needed.

const SEARCH = "https://api.bsky.app/xrpc";

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

// Pages through searchPosts for `phrase`, newest-first, calling onPage after
// each page. Caller filters/dedupes/renders. Stops after maxPages or when the
// AppView runs out of cursor; returns the cursor so the caller can resume
// scanning further back on demand.
export async function scanPhrase(phrase, { cursor = "", maxPages = 20, onPage } = {}) {
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
      });
    }
    nextCursor = d.cursor;
    if (onPage) onPage({ page: pages + 1, pageCount: recs.length, scanned: posts.length, done: !nextCursor || recs.length === 0 });
    if (!nextCursor || recs.length === 0) { pages++; break; }
  }
  return { posts, cursor: nextCursor, pagesScanned: pages };
}

// bsky.app permalink from an at:// uri (works with a DID identifier too, no
// handle lookup needed).
export function postUrl(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

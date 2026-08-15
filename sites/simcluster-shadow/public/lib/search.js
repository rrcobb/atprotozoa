// search.js — find #shadowsimcluster posts via the public AppView. Copied
// and trimmed from sites/notasexthing/public/lib/bsky.js's scanPhrase
// (copy, don't abstract), which itself traces to crosstag/public/lib/bsky.js.
//   SEARCH (api.bsky.app) — searchPosts. public.api.bsky.app 403s search,
//     but api.bsky.app serves it unauthenticated with CORS *. No worker
//     needed.

const SEARCH = "https://api.bsky.app/xrpc";

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

// Pages through searchPosts for the #shadowsimcluster tag, newest-first,
// until maxPages or the cursor runs dry. Caller filters/dedupes/renders.
export async function scanShadowPosts({ maxPages = 8 } = {}) {
  const posts = [];
  let cursor = "";
  for (let pages = 0; pages < maxPages; pages++) {
    const u = new URL(`${SEARCH}/app.bsky.feed.searchPosts`);
    u.searchParams.set("q", "#shadowsimcluster");
    u.searchParams.set("sort", "latest");
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
        text: rec.text || "",
        createdAt: rec.createdAt || p.indexedAt,
        embed: p.embed || null,
      });
    }
    cursor = d.cursor;
    if (!cursor || recs.length === 0) break;
  }
  return posts;
}

export function postUrl(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

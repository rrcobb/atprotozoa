// bsky.js — hindex's AppView search helper. Copied+trimmed from
// notasexthing/public/lib/bsky.js's searchGet lineage (copy, don't abstract).
//   SEARCH (api.bsky.app) — searchPosts. public.api.bsky.app 403s search,
//     but api.bsky.app serves it unauthenticated with CORS * (verified in
//     notes/70-reply-and-rich.md's "HAMMERED" test). No worker needed.

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

// Deliberately caps at a couple of pages rather than the usual "bulk read,
// no pagination" advice — see notes/buildthis/builder/INSTRUCTIONS.md's caps
// order (grep GRAPH_PAGES): that rule is about avoiding an artificial cap on
// data that has a bulk-download equivalent. searchPosts has none (it's a
// live AppView index, not a repo), and this widget runs client-side on every
// page load — paging it out fully would mean hammering the public search API
// once per visitor just to render a "recent mentions" strip. This is a vibe
// count, not an archive, so it says "100+" rather than pretending to be exact.
export async function scanPhrase(phrase, { maxPages = 2 } = {}) {
  const posts = [];
  let cursor = "";
  let pages = 0;
  for (; pages < maxPages; pages++) {
    const u = new URL(`${SEARCH}/app.bsky.feed.searchPosts`);
    u.searchParams.set("q", phrase);
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
      });
    }
    cursor = d.cursor;
    if (!cursor || recs.length === 0) { pages++; break; }
  }
  return { posts, cappedOut: pages >= maxPages && posts.length > 0 };
}

export function postUrl(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

// Exact count of posts that @-mention a DID as a facet, from microcosm.blue's
// Constellation (blue.microcosm.links.getBacklinks). The AppView search above
// caps at two pages and says "100+"; Constellation's `total` is the whole
// index (which starts 2025-01-28). Two source paths because two versions of
// the facet encoding are in the wild; both are summed. `/links/all?target=`
// on Constellation lists which paths point at a DID, if a third turns up.
// Returns null on any failure so the caller can fall back to the search count.
const CONSTELLATION = "https://constellation.microcosm.blue";
const MENTION_PATHS = [
  "app.bsky.feed.post:facets[app.bsky.richtext.facet].features[app.bsky.richtext.facet#mention].did",
  "app.bsky.feed.post:facets[].features[app.bsky.richtext.facet#mention].did",
];

export async function countMentions(did) {
  try {
    let total = 0;
    for (const source of MENTION_PATHS) {
      const u = new URL(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks`);
      u.searchParams.set("subject", did);
      u.searchParams.set("source", source);
      u.searchParams.set("limit", "1");
      const r = await fetch(u);
      if (!r.ok) return null;
      const d = await r.json();
      total += Number(d.total) || 0;
    }
    return total;
  } catch {
    return null;
  }
}

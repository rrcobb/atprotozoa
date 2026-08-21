// search.js — page through Bluesky search for a phrase, oldest-last.
//
// Anonymous app.bsky.feed.searchPosts 403s at volume (notes/71), so this
// hits sites/trigrams's already-authenticated /api/search proxy directly —
// it's CORS-open by design for exactly this (see sites/trigrams/src/index.ts
// and sites/gracewasright's diary entry in sites/sidenote). No credentials
// of our own needed.
//
// searchPosts already returns replies mixed in with top-level posts — there's
// no reply-only/root-only filter to apply here. Verified live (2026-08-21):
// a 50-post page for a common phrase came back ~40% replies. If "patient
// zero" ever looks wrong, the search index's coverage window is the likelier
// culprit (see the hitLimit caveat in index.html), not a reply exclusion.

const SEARCH_API = "https://trigrams.bisks.net/api/search";
const PAGE_LIMIT = 100;
const MAX_PAGES = 12; // ≤ ~1200 posts scanned — plenty for "as of this morning"

// Some createdAt timestamps carry more than 3 fractional-second digits
// (observed: ".08081300Z"), which not every JS engine parses reliably.
// Truncate to milliseconds before handing to Date().
export function normalizeDate(iso) {
  if (!iso) return iso;
  return iso.replace(/(\.\d{3})\d+Z$/, "$1Z");
}

export function postTime(post) {
  return new Date(normalizeDate(post?.record?.createdAt || post?.indexedAt));
}

// Fetches up to MAX_PAGES of "latest first" results for `phrase`, dedupes by
// uri, and returns them sorted OLDEST FIRST — so posts[0] is the best
// candidate for "patient zero" within whatever window search covers.
// onPage(status) fires after each page for progress UI.
export async function searchAll(phrase, { onPage } = {}) {
  const posts = [];
  const seen = new Set();
  let cursor = "";
  let hitLimit = false;

  for (let p = 0; p < MAX_PAGES; p++) {
    const u = new URL(SEARCH_API);
    u.searchParams.set("q", phrase);
    u.searchParams.set("limit", String(PAGE_LIMIT));
    u.searchParams.set("sort", "latest");
    if (cursor) u.searchParams.set("cursor", cursor);

    let res;
    try {
      res = await fetch(u.toString());
    } catch (e) {
      break;
    }
    if (res.status === 429) break; // back off, use what we have
    if (!res.ok) break;

    const data = await res.json();
    const batch = data.posts || [];
    for (const post of batch) {
      if (!post?.uri || seen.has(post.uri)) continue;
      seen.add(post.uri);
      posts.push(post);
    }

    if (onPage) {
      onPage({
        page: p + 1,
        totalSoFar: posts.length,
        oldestSoFar: batch.length ? postTime(batch[batch.length - 1]) : null,
      });
    }

    cursor = data.cursor;
    if (!cursor || batch.length === 0) break;
    if (p === MAX_PAGES - 1) hitLimit = true;
  }

  posts.sort((a, b) => postTime(a) - postTime(b));
  return { posts, hitLimit };
}

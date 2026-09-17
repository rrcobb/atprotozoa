// search.js — page through Bluesky's search index for a literal phrase, via
// sites/trigrams's authenticated /api/search proxy (anonymous searchPosts
// 403s at volume — see sites/patientzero/public/lib/search.js, notes/71 —
// so this hits the same CORS-open proxy every other search-driven site
// uses, no credentials of our own needed).
//
// searchPosts ranks by relevance, not literal containment, so a page can
// come back with posts that only share some of the query's words. Every
// result here is re-checked for the literal (case- and curly-quote-
// insensitive) phrase before it counts — same matchesPhrase() trick as
// patientzero, just without that site's viral-spike "quiet boundary"
// detector: poastclock wants *every* historical match, not just where a
// spike started, so it pages until the API itself runs out (cursor dies) or
// a generous backstop is hit.

const SEARCH_API = "https://trigrams.bisks.net/api/search";
const PAGE_LIMIT = 100;

// Backstops, not data-hiding caps (see notes/40-new-site-playbook.md's
// "question every cap" order) — each protects a real thing:
//   GLOBAL_MAX_PAGES: bounds how many searchPosts calls one page load makes
//   through the bot's shared, rate-limited proxy credential. "poaster's
//   madness" has run ~700 matching posts / ~8 pages as of 2026-09; 60 pages
//   (~6000 posts) is a wide margin past that without letting one page load
//   hammer the proxy indefinitely if the phrase ever goes properly viral.
const GLOBAL_MAX_PAGES = 60;
//   AUTHOR_MAX_PAGES: an author-filtered search is already narrowed to one
//   person's posts, so their most recent qualifying one should surface
//   within the first page or two under sort=latest; this just guards
//   against looping forever if the API keeps handing back a cursor with no
//   new matches.
const AUTHOR_MAX_PAGES = 6;

function normalizeQuotes(s) {
  return (s || "").replace(/[‘’]/g, "'");
}

export function matchesPhrase(post, phraseLower) {
  const text = normalizeQuotes(post?.record?.text || "").toLowerCase();
  return text.includes(phraseLower);
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Shared pagination walk. `extraParams` gets merged into the query (used for
// `author`). Returns { posts, hitLimit } — posts are every literal-phrase
// match found, newest-first (the order the API already returns under
// sort=latest).
async function paginate(phrase, extraParams, maxPages, onProgress) {
  const phraseLower = normalizeQuotes(phrase).toLowerCase();
  const posts = [];
  const seen = new Set();
  let cursor = "";
  let hitLimit = false;

  for (let page = 0; page < maxPages; page++) {
    const u = new URL(SEARCH_API);
    u.searchParams.set("q", phrase);
    u.searchParams.set("limit", String(PAGE_LIMIT));
    u.searchParams.set("sort", "latest");
    if (cursor) u.searchParams.set("cursor", cursor);
    for (const [k, v] of Object.entries(extraParams || {})) {
      if (v) u.searchParams.set(k, v);
    }

    let data;
    try {
      data = await jget(u.toString());
    } catch (err) {
      if (err.status === 429) break; // back off, use what we have
      throw err;
    }

    const batch = data.posts || [];
    for (const post of batch) {
      if (!post?.uri || seen.has(post.uri)) continue;
      if (!matchesPhrase(post, phraseLower)) continue;
      seen.add(post.uri);
      posts.push(post);
    }
    if (onProgress) onProgress({ page: page + 1, totalSoFar: posts.length });

    cursor = data.cursor;
    if (!cursor || batch.length === 0) break;
    if (page === maxPages - 1) hitLimit = true;
  }

  return { posts, hitLimit };
}

// Every historical post anywhere matching `phrase`, literal-checked.
export function searchPhraseAll(phrase, onProgress) {
  return paginate(phrase, {}, GLOBAL_MAX_PAGES, onProgress);
}

// Every historical post by `did` matching `phrase` — used for the
// handle-input predictor, where only one account's history matters.
export function searchPhraseByAuthor(phrase, did, onProgress) {
  return paginate(phrase, { author: did }, AUTHOR_MAX_PAGES, onProgress);
}

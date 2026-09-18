// search.js — page Bluesky search all the way back to find the first post
// that ever contained a phrase.
//
// Anonymous app.bsky.feed.searchPosts 403s at volume (notes/71), so this
// hits sites/trigrams's already-authenticated /api/search proxy, which is
// CORS-open by design for exactly this reuse (see sites/patientzero's diary
// entry in sites/sidenote doing the same thing).
//
// searchPosts ranks by relevance/tokens, not literal containment, so a page
// can include posts that don't actually contain the phrase at all (a
// stemmed or partial term match). sites/patientzero hit this for real: a
// displayed "patient zero" didn't even contain the searched phrase. Every
// result here is filtered through matchesPhrase() (case-insensitive literal
// substring) before it's trusted as a real hit.
//
// This is a game about who said something FIRST, so a sampled or
// heuristically-stopped answer defeats the point — see the no-arbitrary-caps
// rule in builder/INSTRUCTIONS.md. findFirst() pages strictly latest-first
// until the cursor comes back genuinely empty (the search index has nothing
// older left), and only then reports the oldest match seen as the answer.

const SEARCH_API = "https://trigrams.bisks.net/api/search";
const PAGE_LIMIT = 100;

// MAX_PAGES is a backstop, not a sampling limit: it exists only so a
// pathologically common phrase can't page a browser tab forever. At
// limit=100 that's 40,000 posts scanned before giving up — large enough to
// be unreachable for the specific, made-up phrases this tool exists for,
// matching the same "unreachable in practice" backstop size this repo
// already uses elsewhere (kevinmoot's FOLLOWERS_PAGES = 400, see
// builder/INSTRUCTIONS.md). If it's ever hit, the result is reported as
// unconfirmed (see `exhausted` below) rather than presented as certain.
const MAX_PAGES = 400;

// Some createdAt timestamps carry more than 3 fractional-second digits
// (observed in the wild: ".08081300Z"), which not every JS engine parses
// reliably. Truncate to milliseconds before handing to Date().
export function normalizeDate(iso) {
  if (!iso) return iso;
  return iso.replace(/(\.\d{3})\d+Z$/, "$1Z");
}

export function postTime(post) {
  return new Date(normalizeDate(post?.record?.createdAt || post?.indexedAt));
}

export function matchesPhrase(post, phraseLower) {
  const text = (post?.record?.text || "").toLowerCase();
  return text.includes(phraseLower);
}

// Pages latest-first through search results for `phrase`, filtering to
// literal matches, and keeps the oldest one seen. Each page is entirely
// older than the one before it (cursor walks strictly backward in time), and
// within a page results arrive newest-first, so the last literal match on
// any given page that has one is always older than every match found so
// far — safe to just overwrite `oldest` whenever a page has a hit.
//
// onPage(status) fires after each page for progress UI.
//
// Return shape: { first, count, exhausted }.
//   first: the oldest matching post found (or null if none ever matched).
//   count: how many literal matches were seen along the way.
//   exhausted: true once the cursor genuinely ran dry — the search index has
//     nothing earlier left to give, so `first` is confidently the true
//     first. false means MAX_PAGES, a network error, or a rate limit (429)
//     cut the scan short: `first` is only the earliest found SO FAR.
export async function findFirst(phrase, { onPage, signal } = {}) {
  const phraseLower = phrase.trim().toLowerCase();
  let cursor = "";
  let oldest = null;
  let count = 0;
  let exhausted = false;

  for (let p = 0; p < MAX_PAGES; p++) {
    if (signal?.aborted) break;

    const u = new URL(SEARCH_API);
    u.searchParams.set("q", phrase);
    u.searchParams.set("limit", String(PAGE_LIMIT));
    u.searchParams.set("sort", "latest");
    if (cursor) u.searchParams.set("cursor", cursor);

    let res;
    try {
      res = await fetch(u.toString(), { signal });
    } catch (_) {
      break; // network error / aborted mid-fetch — stop, report what we have
    }
    if (res.status === 429) break; // rate-limited — back off, use what we have
    if (!res.ok) break;

    const data = await res.json();
    const batch = data.posts || [];
    const matched = batch.filter((post) => matchesPhrase(post, phraseLower));
    count += matched.length;
    if (matched.length) oldest = matched[matched.length - 1];

    if (onPage) onPage({ page: p + 1, count, oldest });

    cursor = data.cursor;
    if (!cursor || batch.length === 0) {
      exhausted = true;
      break;
    }
  }

  return { first: oldest, count, exhausted };
}

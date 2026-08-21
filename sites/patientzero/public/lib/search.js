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
//
// Stopping condition (rewritten 2026-08-21, see sites/sidenote): a truly
// viral phrase can blow past a fixed page cap while still deep in its spike,
// which was cutting patient zero off mid-outbreak — @bisks.net flagged this
// live on patientzero.bisks.net. Instead of stopping at a fixed post count,
// each page's post-rate (posts/ms, latest page first = most recent) is fed
// to a quiet-boundary detector: once the rate has dropped to a small
// fraction of the peak rate seen so far, for a couple of pages running,
// we've paged all the way back through the spike into the pre-spike
// baseline — that's the actual shape of "found the sharp recent increase,"
// done in code instead of by eyeballing a chart. MAX_PAGES is now just the
// backstop for phrases that never show that quiet baseline at all (a slow
// burn, or a genuinely bottomless spike) — see foundBaseline/hitLimit below.

const SEARCH_API = "https://trigrams.bisks.net/api/search";
const PAGE_LIMIT = 100;
const MAX_PAGES = 40; // ≤ ~4000 posts scanned — the quiet detector usually stops well short of this
const QUIET_FRACTION = 0.15; // a page's rate at/below this fraction of the peak counts as "quiet"
const QUIET_STREAK_NEEDED = 2; // consecutive quiet pages before we trust we've found the pre-spike baseline
const MIN_SPAN_MS = 30 * 60_000; // a page needs to cover at least this much wall-clock time for its rate to mean anything

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

// A page's post rate, in posts/ms. `batch` is one page of search results
// (already newest-first within the page, same as the API returns it). Returns
// null when the page doesn't span enough wall-clock time to say anything
// meaningful about "how busy was this window" — e.g. a page that's all from
// the same minute is a burst, not a rate.
export function pageRate(batch) {
  if (!batch || batch.length < 2) return null;
  const first = postTime(batch[0]).getTime();
  const last = postTime(batch[batch.length - 1]).getTime();
  const span = Math.abs(first - last);
  if (span < MIN_SPAN_MS) return null;
  return batch.length / span;
}

// Stateful quiet-boundary detector — feed it pages in fetch order (latest
// first). It tracks the peak rate seen so far and returns true from feed()
// once the rate has dropped to QUIET_FRACTION of that peak for
// QUIET_STREAK_NEEDED pages running: we've paged back through the whole
// spike into the low-volume period that came before it, so whatever's the
// oldest post gathered so far is a trustworthy patient zero — not just
// "wherever the page cap happened to land."
export function makeQuietDetector() {
  let peak = 0;
  let quietStreak = 0;
  return {
    feed(batch) {
      const rate = pageRate(batch);
      if (rate == null) return false; // no usable signal from this page — keep paging
      if (rate > peak) {
        peak = rate;
        quietStreak = 0;
        return false;
      }
      if (peak > 0 && rate <= peak * QUIET_FRACTION) {
        quietStreak++;
      } else {
        quietStreak = 0;
      }
      return quietStreak >= QUIET_STREAK_NEEDED;
    },
  };
}

// Fetches "latest first" results for `phrase` until the quiet-boundary
// detector finds the pre-spike baseline (or MAX_PAGES is hit as a backstop),
// dedupes by uri, and returns them sorted OLDEST FIRST — so posts[0] is the
// best candidate for "patient zero." onPage(status) fires after each page
// for progress UI.
//
// Return shape: { posts, hitLimit, foundBaseline }.
//   foundBaseline: true  → the quiet detector found a clear low-volume period
//                          before the earliest gathered post. High confidence.
//   hitLimit: true       → paged all the way to MAX_PAGES without ever
//                          finding that quiet period. Low confidence — could
//                          be a genuinely bottomless phrase, or search's
//                          coverage window ran out from under us.
//   both false            → ran out of search results entirely (cursor died
//                          or a page came back empty) before either of the
//                          above triggered. Highest confidence: nothing more
//                          for this phrase exists in the index at all.
export async function searchAll(phrase, { onPage } = {}) {
  const posts = [];
  const seen = new Set();
  let cursor = "";
  let hitLimit = false;
  let foundBaseline = false;
  const quiet = makeQuietDetector();

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

    if (quiet.feed(batch)) {
      foundBaseline = true;
      break;
    }

    cursor = data.cursor;
    if (!cursor || batch.length === 0) break;
    if (p === MAX_PAGES - 1) hitLimit = true;
  }

  posts.sort((a, b) => postTime(a) - postTime(b));
  return { posts, hitLimit, foundBaseline };
}

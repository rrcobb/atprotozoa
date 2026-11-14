// search.js — every post matching a phrase, via the public AppView's searchPosts.
// api.bsky.app serves searchPosts unauthenticated with CORS * (public.api.bsky.app
// 403s it); it soft-403s/429s under bursts, so both are retried with backoff.
import { linkedDids } from "./model.js";

const SEARCH = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 7) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return await r.json();
      if (!(r.status === 429 || r.status === 403 || r.status >= 500)) return null;
      const ra = parseInt(r.headers.get("retry-after") || "", 10);
      await sleep(ra ? ra * 1000 : 700 * (i + 1) + 300 * i * i);
    } catch {
      await sleep(700 * (i + 1));
    }
  }
  return null;
}

function toPost(p) {
  const rec = p.record || {};
  // indexedAt, not the record's createdAt: that one can be backdated (a 2010 "banh mi" post
  // showed up), and the search window is keyed on when the network saw the post.
  const t = Date.parse(p.indexedAt);
  return {
    uri: p.uri,
    did: p.author.did,
    handle: p.author.handle,
    name: p.author.displayName || "",
    text: rec.text || "",
    createdAt: isNaN(t) ? Date.parse(rec.createdAt) || Date.now() : t,
    links: linkedDids(rec),
  };
}

const HOUR = 3600e3;

// searchPosts 403s any request that carries a `cursor`, so pagination is done by time:
// newest-first pages of 100, each next page asks for until = oldest post seen so far.
// Walks the window until a page comes back short, i.e. the window is exhausted.
async function walkWindow(q, since, until, add) {
  let failed = 0;
  for (;;) {
    const u = new URL(SEARCH);
    u.searchParams.set("q", q);
    u.searchParams.set("sort", "latest");
    u.searchParams.set("limit", "100");
    u.searchParams.set("since", new Date(since).toISOString());
    u.searchParams.set("until", new Date(until).toISOString());
    const d = await get(u.toString());
    if (!d) return failed + 1;
    const ps = (d.posts || []).map(toPost);
    add(ps);
    if (ps.length < 100) return failed;
    const oldest = Math.min(...ps.map((p) => p.createdAt));
    // a full page that all shares one instant would never advance; step past it
    until = oldest < until ? oldest : until - 1;
    if (until <= since) return failed;
  }
}

export const START = Date.parse("2023-02-01T00:00:00Z");
// "bahn mi" / "bahnmi" are the common misspellings, so they count as banh mi posts too.
export const TERMS = ['"banh mi"', "banhmi", '"bánh mì"', '"banh mis"', '"bahn mi"', "bahnmi", '"bahn mis"'];
const SLICE = 30 * 24 * HOUR;
// 8 requests in flight: the AppView rate-limits bursts, and get() backs off when it does.
const CONCURRENCY = 8;

// Streams progress via onProgress(postsSoFar, label). Resolves to {posts, failed}.
// `since` is where the walk starts (START for a full crawl, just before the last cached crawl
// for a top-up); `seed` is previously cached posts to merge into.
export async function crawl(onProgress, since = START, seed = []) {
  const seen = new Map(seed.map((p) => [p.uri, p]));
  const add = (ps) => { for (const p of ps) seen.set(p.uri, p); };
  const until = Date.now() + HOUR;
  let failed = 0, done = 0;
  const tasks = [];
  // One probe per term over the whole range. Most terms (the misspellings) come back short,
  // so they cost a single request; only terms with a full first page get split into monthly
  // windows, which are walked 8 at a time.
  await Promise.all(TERMS.map(async (q) => {
    const u = new URL(SEARCH);
    u.searchParams.set("q", q); u.searchParams.set("sort", "latest"); u.searchParams.set("limit", "100");
    u.searchParams.set("since", new Date(since).toISOString()); u.searchParams.set("until", new Date(until).toISOString());
    const d = await get(u.toString());
    if (d) {
      const ps = (d.posts || []).map(toPost);
      add(ps); onProgress(seen.size, `${q} · probing`);
      if (ps.length < 100) return;
    } // a failed probe falls through to the windowed walk, which retries per window
    for (let s = since; s < until; s += SLICE) tasks.push([q, s, Math.min(s + SLICE, until)]);
  }));
  const total = tasks.length;
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < tasks.length) {
      const [q, a, b] = tasks[next++];
      failed += await walkWindow(q, a, b, add);
      onProgress(seen.size, `${q} · ${++done}/${total} windows`);
    }
  }));
  return { posts: [...seen.values()], failed };
}

// moots.js — mutual-follow ("moot") set for one account, plus a bulk
// profile fetch over the result. Added for xbill's EXTRA mode:
// @shimmermathlabs.com replied to the original xbill build asking to also
// grab every one of a handle's moots' profiles, with the same live $-meter
// running through the extra work. META mode (later ask, same thread) reuses
// `fetchFollowers` directly instead of narrowing to the mutual-follow
// intersection — see xbill.js for how the two modes pick a target set.
//
// The account's own follows come for free out of xbill.js's existing repo
// CAR download (app.bsky.graph.follow records live in the same repo as the
// app.bsky.feed.post records it already walks) — no second
// com.atproto.sync.getRepo call needed, so this file only has to fetch the
// other half: who follows *back*. Copy, don't abstract: the
// Constellation-first / getFollowers-fallback approach below is
// sites/kevinmoot's public/lib/bfs.js's fetchFollowers, unchanged — see that
// file's header for why Constellation (microcosm.blue's firehose-backed
// backlink index, 1000/page) goes first and the AppView's own
// getFollowers (100/page) is only the fallback. FOLLOWERS_PAGES matches
// kevinmoot's (400 pages — a backstop, not a budget, per
// notes/40-new-site-playbook.md's "question every cap" order).

const PUB = "https://public.api.bsky.app/xrpc";
const CONSTELLATION = "https://constellation.microcosm.blue";
const CONSTELLATION_PAGES = 400;
const FOLLOWERS_PAGES = 400;
const PROFILE_BATCH_CONCURRENCY = 4;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function graphAll(endpoint, key, did, maxPages) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < maxPages; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

async function fetchFollowersConstellation(did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < CONSTELLATION_PAGES; p++) {
    const u = new URL(`${CONSTELLATION}/links/distinct-dids`);
    u.searchParams.set("target", did);
    u.searchParams.set("collection", "app.bsky.graph.follow");
    u.searchParams.set("path", ".subject");
    u.searchParams.set("limit", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    const page = d.linking_dids || [];
    out.push(...page);
    cursor = d.cursor;
    if (!cursor || !page.length) break;
  }
  return out;
}

export async function fetchFollowers(did) {
  try {
    return await fetchFollowersConstellation(did);
  } catch {
    return graphAll("app.bsky.graph.getFollowers", "followers", did, FOLLOWERS_PAGES);
  }
}

// Fetch every DID's profile, batched 25-per-request (the AppView's cap on
// app.bsky.actor.getProfiles), a few batches in flight at once. We only need
// a running *count* of profiles actually returned (xbill's meter counts
// profiles fetched, it doesn't render them), so this returns the total
// rather than collecting every profile object. `onBatch(gotInThisBatch,
// totalSoFar)` fires after each request lands so the caller can tick a live
// cost as batches complete.
export async function fetchProfilesBatched(dids, onBatch) {
  const batches = [];
  for (let i = 0; i < dids.length; i += 25) batches.push(dids.slice(i, i + 25));

  let totalFetched = 0;
  let idx = 0;
  async function worker() {
    while (idx < batches.length) {
      const batch = batches[idx++];
      const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
      for (const d of batch) u.searchParams.append("actors", d);
      let got = 0;
      try {
        const d = await jget(u.toString());
        got = (d.profiles || []).length;
      } catch {
        // a failed batch just doesn't add to the count — partial data beats
        // aborting the whole run over one flaky request
      }
      totalFetched += got;
      if (onBatch) onBatch(got, totalFetched);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PROFILE_BATCH_CONCURRENCY, batches.length) || 1 }, worker),
  );
  return totalFetched;
}

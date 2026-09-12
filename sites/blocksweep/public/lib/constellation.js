// constellation.js — thin client for constellation.microcosm.blue, the
// microcosm.blue firehose-backed backlink index. Copied from
// sites/blockcurve/public/lib/constellation.js (copy, don't abstract),
// trimmed to the one lookup blocksweep needs: every app.bsky.graph.listblock
// record naming a list as `.subject` — i.e. everyone who has *subscribed* to
// it as a blocklist. That's the "subscribers" @aly.codes pointed out
// (2026-09-12, replying in the thread where @moll.dev first asked for "block
// all the subscribers of a blocklist"): the public AppView has no reverse
// index for list subscriptions, but Constellation crawls the firehose
// independently and indexes every listblock record by its `.subject`
// regardless — the same trick blockcurve already uses for its subscriber
// counts. See notes/ideas/microcosm-blue.md.

const BASE = "https://constellation.microcosm.blue";

// Constellation's own index has a hard start — it never backfilled history
// from before it first came up (2025-01-28T17:00:00Z, per blockcurve's copy
// of this file, which surfaces it in the UI). A listblock record created
// before that date, by an account that hasn't touched it since, may not show
// up here even though the subscription is still real and live.
export const CONSTELLATION_INDEXED_SINCE_MS = 1738083600000;

// Legacy REST endpoint, pages at up to 1000/request (vs. 100 for the xrpc
// successors) — plenty for a straight {did, rkey} backlink walk.
async function fetchAllLinks(target, collection, path, onPage) {
  const out = [];
  let cursor = null;
  let guard = 0;
  for (;;) {
    if (++guard > 5000) break; // runaway-loop backstop, not a data cap
    const qs = new URLSearchParams({ target, collection, path, limit: "1000" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${BASE}/links?${qs}`);
    if (!res.ok) throw new Error(`constellation /links ${res.status}`);
    const body = await res.json();
    const records = body.linking_records || body.records || [];
    for (const r of records) out.push({ did: r.did, rkey: r.rkey });
    if (onPage) onPage(out.length, body.total ?? null);
    cursor = body.cursor || null;
    if (!cursor || records.length === 0) break;
  }
  return out;
}

// Subscribers to a given list: every app.bsky.graph.listblock record naming
// `listUri` as .subject — the accounts that added this list to their own
// blocking, not the list's curated membership.
export function fetchListSubscribers(listUri, onPage) {
  return fetchAllLinks(listUri, "app.bsky.graph.listblock", ".subject", onPage);
}

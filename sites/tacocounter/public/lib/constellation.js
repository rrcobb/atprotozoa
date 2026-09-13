// constellation.js — thin client for constellation.microcosm.blue, the
// microcosm.blue firehose-backed backlink index. Copied from
// sites/blocksweep/public/lib/constellation.js (copy, don't abstract),
// pointed at the one lookup tacocounter needs: every
// net.bisks.tacocounter.membership record naming a board as `.board` — i.e.
// everyone who has joined that leaderboard.
//
// This is also what makes a "private" board work without a server: the only
// way to discover a board's members is to already know its at-uri (the
// share link/code embeds it), since there's no public directory of boards.
// See notes/ideas/microcosm-blue.md.

const BASE = "https://constellation.microcosm.blue";

// Constellation's own index has a hard start — it never backfilled history
// from before it first came up (2025-01-28T17:00:00Z, per blockcurve's copy
// of this file). A membership record created before that date by an account
// that hasn't touched it since may not show up here — irrelevant in
// practice since tacocounter (and its lexicons) postdate that by a long way.
export const CONSTELLATION_INDEXED_SINCE_MS = 1738083600000;

const MEMBERSHIP_COLLECTION = "net.bisks.tacocounter.membership";

// Legacy REST endpoint, pages at up to 1000/request (vs. 100 for the xrpc
// successors) — plenty for a straight {did, rkey} backlink walk. Loops until
// genuinely exhausted, no page cap, per the "prefer bulk reads, question
// every cap" standing orders — a board's membership list is exactly the
// kind of thing that shouldn't get silently truncated.
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

// Members of a board: every net.bisks.tacocounter.membership record naming
// `boardUri` as .board.
export function fetchBoardMembers(boardUri, onPage) {
  return fetchAllLinks(boardUri, MEMBERSHIP_COLLECTION, ".board", onPage);
}

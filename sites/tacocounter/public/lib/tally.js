// tally.js — sums up a DID's own net.bisks.tacocounter.log records into a
// running total. Each log is an immutable "I ate N tacos" event written to
// the logger's own PDS, so a total is just "walk my own collection and add
// them up" — no shared index needed for this half.
//
// Per the 2026-08-25 "prefer bulk reads" standing order this loops
// listRecords to genuine exhaustion (no page cap) rather than capping the
// walk out of reflexive caution — a taco log is small enough per person that
// a full com.atproto.sync.getRepo CAR download (the bulk-download
// alternative for "all of someone's records") would be overkill for reading
// one collection; a cursor loop that never stops early already satisfies the
// same "don't truncate history" goal.

import { resolvePds } from "./oauth.js";

const LOG_COLLECTION = "net.bisks.tacocounter.log";

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// { total, entries, lastAte } for one DID's own taco log.
export async function fetchTacoTotal(did) {
  const pds = await resolvePds(did);
  if (!pds) return { total: 0, entries: 0, lastAte: null };
  const base = pds.replace(/\/$/, "");
  let cursor;
  let total = 0;
  let entries = 0;
  let lastAte = null;
  for (;;) {
    const params = new URLSearchParams({ repo: did, collection: LOG_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    const records = Array.isArray(data.records) ? data.records : [];
    for (const r of records) {
      const v = r?.value;
      if (!v || typeof v.count !== "number" || !Number.isFinite(v.count)) continue;
      total += Math.max(0, Math.round(v.count));
      entries += 1;
      const at = Date.parse(v.eatenAt || "");
      if (at && (!lastAte || at > lastAte)) lastAte = at;
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !records.length) break;
  }
  return { total, entries, lastAte };
}

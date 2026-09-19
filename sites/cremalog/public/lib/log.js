// log.js — reads a DID's own net.bisks.cremalog.review records into a
// sorted list. Each review is an immutable "I had this latte, rated it N"
// event written to the reviewer's own PDS, so a log is just "walk my own
// collection" — no shared index needed.
//
// Per the 2026-08-25 "prefer bulk reads, no arbitrary caps" standing order
// this loops listRecords to genuine exhaustion (no page cap) rather than
// capping the walk out of reflexive caution — a personal latte log is small
// enough per person that a full com.atproto.sync.getRepo CAR download (the
// bulk-download alternative for "all of someone's records") would be
// overkill for reading one collection; a cursor loop that never stops early
// already satisfies the same "don't truncate history" goal.

import { resolvePds } from "./oauth.js";

export const REVIEW_COLLECTION = "net.bisks.cremalog.review";

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// Every review for one DID, newest first: [{ uri, drink, shop, rating, notes, reviewedAt }].
// `rating` comes back as a 0–10 float (the lexicon stores it ×10 as an integer).
export async function fetchLog(did) {
  const pds = await resolvePds(did);
  if (!pds) return [];
  const base = pds.replace(/\/$/, "");
  let cursor;
  const out = [];
  for (;;) {
    const params = new URLSearchParams({ repo: did, collection: REVIEW_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    const records = Array.isArray(data.records) ? data.records : [];
    for (const r of records) {
      const v = r?.value;
      if (!v || typeof v.drink !== "string" || typeof v.rating !== "number") continue;
      const reviewedAt = Date.parse(v.reviewedAt || "");
      out.push({
        uri: r.uri,
        drink: v.drink,
        shop: typeof v.shop === "string" ? v.shop : "",
        rating: Math.max(0, Math.min(10, v.rating)) / 10,
        notes: typeof v.notes === "string" ? v.notes : "",
        reviewedAt: Number.isFinite(reviewedAt) ? reviewedAt : null,
      });
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !records.length) break;
  }
  out.sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0));
  return out;
}

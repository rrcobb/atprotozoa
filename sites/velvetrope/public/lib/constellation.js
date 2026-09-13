// constellation.js — thin client for constellation.microcosm.blue, the
// microcosm.blue firehose-backed backlink index. Copied from
// sites/blockcurve/public/lib/constellation.js (copy, don't abstract),
// trimmed to the one lookup velvetrope needs: every app.bsky.graph.listitem
// record naming a DID as `.subject`, paired with the list URI (`.list`) it
// lives on — the actual reverse index for "which lists is this DID on,"
// which no AppView endpoint answers (membership only indexes forward,
// owner -> members). Public, unauthenticated, CORS-enabled.
//
// This replaces velvetrope's old "scan the lists made by people you follow
// or who follow you" heuristic (2026-09-13, @heika.dog) — Constellation
// crawls the whole network's listitem records independently of who you're
// connected to, so it can answer "lists you're on" for real instead of
// "lists you might be on, within your own network."

const BASE = "https://constellation.microcosm.blue";

// Constellation's own index has a hard start — it crawls the firehose live
// and never backfilled history from before it first came up
// (2025-01-28T17:00:00Z, per blockcurve's copy of this file). A listitem
// record older than that, on an account that hasn't touched it since, may
// not show up here even though the membership is still real and live.
export const CONSTELLATION_INDEXED_SINCE_MS = 1738083600000;

// getManyToMany is the only way to learn, for an app.bsky.graph.listitem
// record found by its .subject, which list (.list) it belongs to — without
// this we'd need one com.atproto.repo.getRecord per listitem hit. Only
// exists as an xrpc endpoint, capped at 100/page.
async function fetchAllManyToMany(subject, source, pathToOther, onPage) {
  const out = [];
  let cursor = null;
  let guard = 0;
  for (;;) {
    if (++guard > 5000) break; // runaway-loop backstop, not a data cap
    const qs = new URLSearchParams({ subject, source, pathToOther, limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${BASE}/xrpc/blue.microcosm.links.getManyToMany?${qs}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`constellation getManyToMany ${res.status}`);
    const body = await res.json();
    const items = body.items || [];
    for (const it of items) {
      out.push({ did: it.linkRecord?.did, rkey: it.linkRecord?.rkey, otherSubject: it.otherSubject });
    }
    if (onPage) onPage(out.length);
    cursor = body.cursor || null;
    if (!cursor || items.length === 0) break;
  }
  return out;
}

// List memberships: every app.bsky.graph.listitem naming `did` as .subject,
// paired with the list URI (.list) it lives on. Includes curation lists as
// well as modlists — callers that want only modlists filter on the list's
// own `.purpose` after resolving each URI.
export function fetchListMemberships(did, onPage) {
  return fetchAllManyToMany(did, "app.bsky.graph.listitem:subject", "list", onPage);
}

// constellation.js — thin client for constellation.microcosm.blue, the
// microcosm.blue firehose-backed backlink index (see
// notes/ideas/microcosm-blue.md). listrank leans on it for the one thing no
// AppView endpoint offers: "every moderation list a given DID is a member
// of" — list membership (app.bsky.graph.listitem) is public but there's no
// reverse index for it anywhere else. Public, unauthenticated, CORS-enabled.
//
// getManyToMany resolves the *other side* of a many-to-many relationship for
// us — given a listitem's `.subject` (a member DID), it hands back the
// `.list` URI each matching record points at, without a separate
// com.atproto.repo.getRecord per hit. Copied from sites/blockcurve's
// fetchListMemberships (copy, don't abstract).
//
// This file is deliberately one-directional (subject DID -> lists it's on).
// A candidate list's own full membership (for the .bsky.social share sample
// and its exact member count) comes from a repo CAR download of the list
// owner's own listitem records instead — see rank.js's fetchListMembers —
// because every listitem lives in the owner's repo already, same as this
// site's own blocks/follows read; walking Constellation's reverse direction
// would mean a second per-member handle-resolution pass on top of a
// membership walk that, for a genuinely large blocklist, has no natural
// stopping point short of the whole list (see rank.js's header for why that
// isn't the shape this needs).

const BASE = "https://constellation.microcosm.blue";

// Constellation's own index has a hard start (2025-01-28T17:00:00Z) — it
// never backfilled the firehose from before it first came up. A listitem
// added earlier, by an account that hasn't touched it since, may be missing
// here even though the membership is still real. Surfaced in the UI.
export const CONSTELLATION_INDEXED_SINCE_MS = 1738083600000;

// A membership-discovery pass (per blocked/followed account) is capped as a
// backstop, not a budget — verified live (2026-09-15) against
// vikanezrimaya.xyz, whose blocks include at least one account that turned
// up on 17,000+ lists. At 100/page (the xrpc endpoint's cap) this is
// <=40,000 list memberships scanned per account, matching kevinmoot's own
// GRAPH_PAGES/FOLLOWERS_PAGES backstop value (raised 2026-08-28, see
// notes/40-new-site-playbook.md) rather than a fresh guess.
const LIST_PAGES = 400;

async function fetchAllManyToMany(subject, source, pathToOther, maxPages) {
  const out = [];
  let cursor = null;
  for (let p = 0; p < maxPages; p++) {
    const qs = new URLSearchParams({ subject, source, pathToOther, limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${BASE}/xrpc/blue.microcosm.links.getManyToMany?${qs}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`constellation getManyToMany ${res.status}`);
    const body = await res.json();
    const items = body.items || [];
    for (const it of items) out.push(it.otherSubject);
    cursor = body.cursor || null;
    if (!cursor || items.length === 0) break;
  }
  return out;
}

// Every moderation-list URI (.list) that has a app.bsky.graph.listitem
// record naming `did` as its .subject — i.e. every list `did` is a member
// of, discovered without a per-hit record fetch.
export function fetchListMemberships(did) {
  return fetchAllManyToMany(did, "app.bsky.graph.listitem:subject", "list", LIST_PAGES);
}

export function listWebUrl(listUri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/]+)$/.exec(listUri || "");
  return m ? `https://bsky.app/profile/${m[1]}/lists/${m[2]}` : null;
}

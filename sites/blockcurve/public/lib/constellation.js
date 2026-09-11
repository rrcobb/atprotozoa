// constellation.js — thin client for constellation.microcosm.blue, the
// microcosm.blue firehose-backed backlink index. See
// notes/ideas/microcosm-blue.md for how this project already uses it
// (kevinmoot's followers lookup). blockcurve leans on it for the thing no
// AppView endpoint offers: "every app.bsky.graph.block record whose
// .subject is this DID" — blocks are private to view *as a relationship*
// (Bluesky won't tell you who blocked you), but each block is still a
// public record in the blocker's own repo, and Constellation already
// crawled and indexed it by target. Public, unauthenticated, CORS-enabled.

const BASE = "https://constellation.microcosm.blue";

// Legacy REST endpoints (still supported, not going away per the API's own
// docs) page at up to 1000/request, ~10x the xrpc successors' 100 cap — used
// here for the two straight backlink walks (direct blocks, listblock
// subscribers) where nothing but {did, rkey} is needed. Matches the
// bulk-read precedent already set in sites/kevinmoot/public/lib/bfs.js.
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

// getManyToMany is the only way to learn, for a app.bsky.graph.listitem
// record we found by its .subject, which list (.list) it belongs to —
// without this we'd need one com.atproto.repo.getRecord per listitem hit.
// Only exists as an xrpc endpoint, capped at 100/page.
async function fetchAllManyToMany(subject, source, pathToOther, onPage) {
  const out = [];
  let cursor = null;
  let guard = 0;
  for (;;) {
    if (++guard > 5000) break;
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

// Direct blocks: every app.bsky.graph.block record naming `did` as .subject.
export function fetchDirectBlocks(did, onPage) {
  return fetchAllLinks(did, "app.bsky.graph.block", ".subject", onPage);
}

// Modlist memberships: every app.bsky.graph.listitem naming `did` as
// .subject, paired with the list URI (.list) it lives on.
export function fetchListMemberships(did, onPage) {
  return fetchAllManyToMany(did, "app.bsky.graph.listitem:subject", "list", onPage);
}

// Subscribers to a given list: every app.bsky.graph.listblock record naming
// `listUri` as .subject.
export function fetchListSubscribers(listUri, onPage) {
  return fetchAllLinks(listUri, "app.bsky.graph.listblock", ".subject", onPage);
}

// Followers: every app.bsky.graph.follow record naming `did` as .subject —
// i.e. everyone who follows this account. Optional overlay for the "chart
// follower growth alongside it" ask; a different scale than blocks, so it
// gets its own axis in app.js rather than sharing the block-count one.
export function fetchFollowers(did, onPage) {
  return fetchAllLinks(did, "app.bsky.graph.follow", ".subject", onPage);
}

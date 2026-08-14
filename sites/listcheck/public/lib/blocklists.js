// blocklists.js — check whether one account blocks another, directly or
// via a subscribed moderation list.
//
// This used to walk an account's own app.bsky.graph.listblock records (off
// its PDS) and page app.bsky.graph.getList against the other DID looking
// for reachability, because no AppView endpoint answered "does A block B"
// for an arbitrary pair. @mary.my.id pointed out (2026-08-14) that
// app.bsky.graph.getRelationships does: it's public, takes one `actor` and
// up to 30 `others`, and returns a #relationship per other with `blocking`/
// `blockedBy` (direct block records) *and* `blockingByList`/`blockedByList`
// (which list, if either side blocks via one) — both directions of a
// pair-check in one AppView round trip, and it catches direct blocks too,
// which the old list-only walk never checked at all. Switched
// checkBlockPair() to it below.
//
// blockingByList/blockedByList are the list's own AT-URI directly (verified
// against live data 2026-08-14 — the lexicon's prose describes it as "the
// listblock record" but the AppView actually resolves straight to the list).
// A list hit still wants one page of that list (for its name) before the
// "browse this list" drill-down becomes worth showing — cheap, one request,
// not a reachability walk.
//
// Deliberately pairwise: this module only ever answers "does A block B (or
// B block A)" for two specific DIDs you already have. It does not expose a
// "sweep this whole list of people and tell me who's blocked" batch call —
// see sites/blockledger/RETIRED.md for why that shape of tool got pulled by
// its own requester, and public/index.html here for how the UI keeps every
// check a deliberate one-at-a-time click instead of an automatic bulk table.
// getRelationships *could* batch up to 30 pairs per call, but that batching
// stays unused here on purpose — one click, one pair, same as before.

import { jget } from "./identity.js";

const PUB = "https://public.api.bsky.app/xrpc";

const MAX_LIST_MEMBER_PAGES = 20; // <= 2000 members per list, for the drill-down

// listUri -> { name, members: Map<did, profile>, cursor, exhausted, pages, queue }
// `queue` serializes page-fetches for one list so two concurrent lookups
// against the same list (e.g. the two directions of one pair-check, or two
// different pairs that share a popular curated list) resume each other's
// progress instead of racing duplicate requests for the same page. Members
// are stored with the profile info getList already hands back, so the
// drill-down view never has to re-fetch a profile per member.
const listState = new Map();

function stateFor(listUri) {
  let s = listState.get(listUri);
  if (!s) {
    s = { name: "", members: new Map(), cursor: "", exhausted: false, pages: 0, queue: Promise.resolve() };
    listState.set(listUri, s);
  }
  return s;
}

// Advance a list's paging cursor until `stopWhen(state)` is true, or the
// list/page-cap is exhausted — whichever comes first. This is the one place
// that talks to app.bsky.graph.getList; both the reachability check and the
// full-membership drill-down below are just different `stopWhen`s over it.
function advance(listUri, stopWhen) {
  const s = stateFor(listUri);
  s.queue = s.queue.then(async () => {
    while (!s.exhausted && s.pages < MAX_LIST_MEMBER_PAGES && !stopWhen(s)) {
      const u = new URL(`${PUB}/app.bsky.graph.getList`);
      u.searchParams.set("list", listUri);
      u.searchParams.set("limit", "100");
      if (s.cursor) u.searchParams.set("cursor", s.cursor);
      let d;
      try {
        d = await jget(u.toString());
      } catch {
        s.exhausted = true;
        break;
      }
      s.pages++;
      if (d.list && d.list.name) s.name = d.list.name;
      for (const item of d.items || []) {
        const subj = item.subject;
        if (subj && subj.did) {
          s.members.set(subj.did, {
            did: subj.did,
            handle: subj.handle || subj.did,
            displayName: subj.displayName || subj.handle || subj.did,
            avatar: subj.avatar || "",
          });
        }
      }
      s.cursor = d.cursor;
      if (!s.cursor || !(d.items || []).length) s.exhausted = true;
    }
    return s;
  });
  return s.queue;
}

// Drill-down: page the *rest* of one specific list in. Only called when the
// user explicitly asks to browse a list a check surfaced — never as part of
// the pair-check itself. Resumes from wherever the pair-check's one-page
// name lookup left off, and returns the profiles getList already gave us —
// no per-member fetch.
export async function getFullListMembers(listUri) {
  const s = await advance(listUri, () => false);
  return { name: s.name || "an unnamed list", members: Array.from(s.members.values()) };
}

export function listWebUrl(listUri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/]+)$/.exec(listUri || "");
  return m ? `https://bsky.app/profile/${m[1]}/lists/${m[2]}` : null;
}

// One side of a pair-check: given getRelationships' direct-block URI and
// list URI for this direction, say whether it's a hit and, if it's a list
// hit, page one page of that list in — just enough for its name — before
// the "browse this list" drill-down becomes worth showing.
async function resolveHit(directUri, listUri) {
  if (directUri) return { direct: true };
  if (!listUri) return null;
  const s = await advance(listUri, (st) => st.pages >= 1);
  return { direct: false, listUri, listName: s.name || "an unnamed list" };
}

// The one entry point the UI calls: does `aDid` block `bDid`, and/or does
// `bDid` block `aDid` — directly or via a list either side subscribes to?
// One app.bsky.graph.getRelationships call answers both directions at once.
export async function checkBlockPair(aDid, bDid) {
  const u = new URL(`${PUB}/app.bsky.graph.getRelationships`);
  u.searchParams.set("actor", aDid);
  u.searchParams.append("others", bDid);
  const d = await jget(u.toString());
  const rel = (d.relationships || []).find((r) => r.did === bDid) || {};

  const [aBlocksB, bBlocksA] = await Promise.all([
    resolveHit(rel.blocking, rel.blockingByList),
    resolveHit(rel.blockedBy, rel.blockedByList),
  ]);

  return { aBlocksB, bBlocksA };
}

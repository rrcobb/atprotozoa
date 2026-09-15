// list-io.js — the "read one thing fully" I/O primitives rank.js's two
// heaviest fan-out stages need: a repo's own blocks+follows (one CAR
// download) and a single list's own record + full membership (one direct
// getRecord, one more CAR download of the list owner's repo, plus a sampled
// share-of-.bsky.social pass). Split out of rank.js so the exact same code
// can run either inline on whichever thread calls rank.js, or inside
// rank-pool-worker.js — the small pool of real Worker threads rank.js
// dispatches those two stages to (see workerpool.js's header for why: this
// is the CBOR/MST decode that was freezing the tab, per
// @vikanezrimaya.xyz's report).

import { jget, resolvePds, getHandles } from "./identity.js";
import { fetchRepoRecordsWithKeys } from "./car.js";

export const PUB = "https://public.api.bsky.app/xrpc";
export const FALLBACK_PAGES = 400; // paginated listRecords fallback if the CAR read fails — same backstop value as kevinmoot's GRAPH_PAGES, see notes/40-new-site-playbook.md 2026-08-28
export const LIST_MEMBERS_PAGES = 400; // fallback-only paginated getList walk, same backstop value as kevinmoot's GRAPH_PAGES — the primary path is a bulk CAR read with no page cap at all
export const SHARE_SAMPLE_SIZE = 300; // a percentage doesn't need a full census — 300 resolved handles is plenty for a stable estimate, and keeps getProfiles calls from scaling with a mega-list's true size

// A candidate list's own record (purpose/name/description/creator DID), used
// to filter discovery candidates down to actual moderation lists. One direct
// record fetch — not a Constellation lookup, not getList pagination — since
// a single at:// URI already names exactly which repo + rkey to read.
export async function getListRecord(listUri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/]+)$/.exec(listUri || "");
  if (!m) throw new Error("malformed list uri");
  const [, did, rkey] = m;
  const u = new URL(`${PUB}/com.atproto.repo.getRecord`);
  u.searchParams.set("repo", did);
  u.searchParams.set("collection", "app.bsky.graph.list");
  u.searchParams.set("rkey", rkey);
  const d = await jget(u.toString());
  return { did, value: d.value };
}

// Full membership of a surviving candidate list. Every app.bsky.graph.listitem
// naming this list lives in the *list owner's own repo* (same shape as the
// user's own blocks/follows below), so the preferred path is one repo CAR
// download rather than paginating app.bsky.graph.getList — the 2026-08-25
// bulk-reads order. Falls back to paginated getList (owner PDS
// unreachable/non-CORS, oversized repo, malformed CAR) — same fallback
// sites/rollcall's listmembers.js uses for the same reason.
export async function fetchListMembers(listUri) {
  const m = /^at:\/\/([^/]+)\//.exec(listUri || "");
  const ownerDid = m && m[1];
  if (ownerDid) {
    try {
      const pds = await resolvePds(ownerDid);
      if (pds) {
        const { records } = await fetchRepoRecordsWithKeys(pds, ownerDid, "app.bsky.graph.listitem");
        const dids = [];
        const seen = new Set();
        for (const { value } of records) {
          if (value.list !== listUri) continue;
          if (!value.subject || seen.has(value.subject)) continue;
          seen.add(value.subject);
          dids.push(value.subject);
        }
        return dids;
      }
    } catch {
      // fall through to the paginated walk below
    }
  }
  const dids = [];
  const seen = new Set();
  let cursor = "";
  for (let p = 0; p < LIST_MEMBERS_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getList`);
    u.searchParams.set("list", listUri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    for (const item of d.items || []) {
      const did = item.subject && item.subject.did;
      if (did && !seen.has(did)) {
        seen.add(did);
        dids.push(did);
      }
    }
    cursor = d.cursor;
    if (!cursor || !(d.items || []).length) break;
  }
  return dids;
}

export async function fetchOwnRecords(did) {
  const pds = await resolvePds(did);
  if (pds) {
    try {
      const { records } = await fetchRepoRecordsWithKeys(pds, did, ["app.bsky.graph.block", "app.bsky.graph.follow"]);
      return records;
    } catch {
      // fall through to the paginated walk below
    }
  }
  // Fallback: page com.atproto.repo.listRecords directly against the PDS
  // (public AppView doesn't implement this method for arbitrary repos).
  const out = [];
  if (!pds) return out;
  for (const collection of ["app.bsky.graph.block", "app.bsky.graph.follow"]) {
    let cursor = "";
    for (let p = 0; p < FALLBACK_PAGES; p++) {
      const u = new URL(pds.replace(/\/$/, "") + "/xrpc/com.atproto.repo.listRecords");
      u.searchParams.set("repo", did);
      u.searchParams.set("collection", collection);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      let d;
      try {
        d = await jget(u.toString());
      } catch {
        break;
      }
      for (const r of d.records || []) out.push({ uri: r.uri, value: r.value });
      cursor = d.cursor;
      if (!cursor || !(d.records || []).length) break;
    }
  }
  return out;
}

// Exact block/follow overlap counts plus a sampled .bsky.social share for one
// list's already-fetched membership. Shared by rank.js's inline fallback and
// rank-pool-worker.js's "fullMembership" task so the two paths can't drift.
export async function fullListStats(memberDids, blockedDids, followDids) {
  const memberSet = new Set(memberDids);
  let blocksInList = 0;
  for (const d of blockedDids) if (memberSet.has(d)) blocksInList++;
  let followsInList = 0;
  for (const d of followDids) if (memberSet.has(d)) followsInList++;

  const sample = memberDids.slice(0, SHARE_SAMPLE_SIZE);
  let shareResolved = 0;
  let shareBskySocial = 0;
  if (sample.length) {
    let handles;
    try {
      handles = await getHandles(sample);
    } catch {
      handles = new Map();
    }
    shareResolved = handles.size;
    for (const h of handles.values()) if (/\.bsky\.social$/i.test(h)) shareBskySocial++;
  }

  return {
    memberCount: memberSet.size,
    blocksInList,
    followsInList,
    sampled: memberDids.length > sample.length,
    sampleSize: sample.length,
    shareResolved,
    shareBskySocial,
  };
}

// listmembers.js — turn a pasted Bluesky list link into its full membership
// (every subject DID), preferring one bulk repo download over a paginated
// AppView walk.
//
// A list's app.bsky.graph.listitem records all live in the *curator's own
// repo* (each one just points at the list and a subject DID) — so "give me
// every member of this list" is really "give me one person's whole
// listitem history," the exact shape notes/40-new-site-playbook.md's
// 2026-08-25 standing order (from @cee.wtf) says to pull as one
// com.atproto.sync.getRepo CAR instead of paginating. One request gets a
// list's *entire* membership regardless of size, where paginating
// app.bsky.graph.getList is one AppView round-trip per ~100 members. See
// public/lib/car.js (copied from sites/backscroll) for the CAR/MST parser.
//
// Kept app.bsky.graph.getList as an explicit fallback for when the CAR
// download itself fails (curator's PDS unreachable/non-CORS, oversized
// repo, malformed CAR) — per the same standing order, pagination stays
// available as the fallback path, just not the default one.

import { jget, resolveDid, resolvePds } from "./identity.js";
import { fetchRepoRecordsWithKeys } from "./car.js";

const PUB = "https://public.api.bsky.app/xrpc";

// Forgiving about paste formats:
//   https://bsky.app/profile/<handle-or-did>/lists/<rkey>
//   at://<did>/app.bsky.graph.list/<rkey>
//   <did-or-handle> <rkey>   (rare, but accept it)
export async function parseListInput(raw) {
  const s = (raw || "").trim();
  if (!s) throw new Error("paste a list link first");

  let m = /^(?:https?:\/\/)?bsky\.app\/profile\/([^/]+)\/lists\/([a-zA-Z0-9]+)/.exec(s);
  if (!m) m = /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([a-zA-Z0-9]+)/.exec(s);
  if (!m) throw new Error("that doesn't look like a Bluesky list link — try the bsky.app/profile/.../lists/... URL");

  const [, actor, rkey] = m;
  const ownerDid = await resolveDid(actor);
  return { ownerDid, rkey, listUri: `at://${ownerDid}/app.bsky.graph.list/${rkey}` };
}

// One getList page (limit=1 is enough — list metadata comes back on every
// page) for the list's name/purpose/description/creator, without pulling
// any membership through the AppView.
export async function fetchListMeta(listUri) {
  const d = await jget(`${PUB}/app.bsky.graph.getList?list=${encodeURIComponent(listUri)}&limit=1`);
  if (!d.list) throw new Error("list not found (deleted, or the link is wrong)");
  return {
    name: d.list.name || "(untitled list)",
    description: d.list.description || "",
    purpose: d.list.purpose || "",
    creatorHandle: (d.list.creator && d.list.creator.handle) || "",
  };
}

// Preferred path: download the curator's repo CAR once and pull every
// listitem whose `list` field matches this list's URI.
export async function fetchMembersViaCar(ownerDid, listUri, onProgress) {
  const pds = await resolvePds(ownerDid);
  if (!pds) throw new Error("couldn't resolve the list owner's PDS");
  const { records } = await fetchRepoRecordsWithKeys(pds, ownerDid, "app.bsky.graph.listitem", onProgress);
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

const MAX_PAGES = 200; // safety cap on the fallback walk: 100/page -> 20,000 members

// Fallback path: page app.bsky.graph.getList itself. Only reached when the
// CAR download fails outright.
export async function fetchMembersPaginated(listUri, onProgress) {
  const dids = [];
  const seen = new Set();
  let cursor = "";
  let pages = 0;
  while (pages < MAX_PAGES) {
    const u = new URL(`${PUB}/app.bsky.graph.getList`);
    u.searchParams.set("list", listUri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    pages++;
    for (const item of d.items || []) {
      const did = item.subject && item.subject.did;
      if (did && !seen.has(did)) {
        seen.add(did);
        dids.push(did);
      }
    }
    if (onProgress) onProgress(`paginating list membership... page ${pages}, ${dids.length} members so far`);
    cursor = d.cursor;
    if (!cursor || !(d.items || []).length) break;
  }
  if (pages >= MAX_PAGES && cursor) {
    if (onProgress) onProgress(`stopped after ${MAX_PAGES} pages (${dids.length} members) — list is enormous, showing a partial roll`);
  }
  return dids;
}

// The one entry point the UI calls: try the bulk CAR read, fall back to
// pagination on failure. Returns { dids, viaCar }.
export async function fetchAllMembers(ownerDid, listUri, onProgress) {
  try {
    const dids = await fetchMembersViaCar(ownerDid, listUri, onProgress);
    return { dids, viaCar: true };
  } catch (err) {
    if (onProgress) onProgress(`repo CAR download failed (${err.message}) — falling back to paginated list read...`);
    const dids = await fetchMembersPaginated(listUri, onProgress);
    return { dids, viaCar: false };
  }
}

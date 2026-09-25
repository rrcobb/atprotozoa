// atproto.js — read-side AppView helpers (identity resolution, moderation
// lists, list membership) plus the one authenticated bulk-write helper this
// site needs (com.atproto.repo.applyWrites, for a list owner adding/removing
// members in one shot). Copy, don't abstract: trimmed from
// sites/paintmoot/public/lib/atproto.js, with the graph/list-specific bits
// added for velvetrope.

import { fetchRepoRecordsWithKeys } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving handle/DID/URL parsing.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

async function didDoc(did) {
  if (did.startsWith("did:plc:")) {
    const r = await fetch(`${PLC_DIR}/${did}`);
    return r.ok ? r.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
    const r = await fetch(`https://${domain}/.well-known/did.json`);
    return r.ok ? r.json() : null;
  }
  return null;
}

export async function resolvePds(did) {
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return svc?.serviceEndpoint || null;
  } catch {
    return null;
  }
}

export async function getProfile(did) {
  try {
    return await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

// --- social graph (bounded) ----------------------------------------------
//
// There's no AppView endpoint for "which lists is DID X a member of" — list
// membership only indexes forward (owner -> members), not in reverse. Rather
// than crawl the network to build that index ourselves (see
// notes/ideas/store-ours-rederive-theirs.md — re-derive, don't store other
// people's data), we take the cheaper bounded live query: check the mod
// lists made by people in the signed-in user's own network, since that's
// overwhelmingly where you'd actually turn up. Capped pagination, same
// shape as getModLists above.
async function actorDids(endpoint, key, did, cap) {
  const out = [];
  let cursor;
  for (let p = 0; p < 5 && out.length < cap; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const entry of d[key] || []) if (entry.did) out.push(entry.did);
    cursor = d.cursor;
    if (!cursor || !(d[key] || []).length) break;
  }
  return out.slice(0, cap);
}
export function getFollows(did, cap = 150) {
  return actorDids("app.bsky.graph.getFollows", "follows", did, cap);
}
export function getFollowers(did, cap = 150) {
  return actorDids("app.bsky.graph.getFollowers", "followers", did, cap);
}

// --- moderation lists ---------------------------------------------------

// All of an actor's lists whose purpose is app.bsky.graph.defs#modlist
// (moderation lists) — curation lists are left out, this site is only about
// the block/mute-style lists the brief asked for.
//
// MODLIST_PAGE_CAP is a backstop, not a budget — getLists has no
// bulk-download equivalent, so this still paginates, but the page count
// isn't a correctness bound. Matches the moot-family fix (2026-08-28, see
// notes/40-new-site-playbook.md): the prior 10-page cap contradicted "all of
// an actor's lists" above it, silently dropping anything past 1000 lists.
const MODLIST_PAGE_CAP = 400;
export async function getModLists(actorDid) {
  const out = [];
  let cursor;
  for (let p = 0; p < MODLIST_PAGE_CAP; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getLists`);
    u.searchParams.set("actor", actorDid);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const l of d.lists || []) {
      if (l.purpose === "app.bsky.graph.defs#modlist") out.push(l);
    }
    cursor = d.cursor;
    if (!cursor || !(d.lists || []).length) break;
  }
  return out;
}

// List metadata only (name, avatar, description, creator, listItemCount) —
// a single call with no member-page walk, so a page can render its header
// and known total before the (potentially much slower) full membership read
// below finishes.
export async function getListMeta(listUri) {
  const u = new URL(`${PUB}/app.bsky.graph.getList`);
  u.searchParams.set("list", listUri);
  u.searchParams.set("limit", "1");
  const d = await jget(u.toString());
  if (!d.list) throw new Error("list not found");
  return d.list;
}

const LIST_FALLBACK_MAX_PAGES = 2000; // runaway-loop backstop, not a real limit — 200k members is far past any real mod list

// Every member of a list, each carrying `uri` — the AT URI of the
// app.bsky.graph.listitem record itself, which is exactly what a list owner
// needs to delete a member later (rkey = last uri segment). Used only for
// the owner's own approve/deny execution (writing/removing real listitem
// records needs to know what already exists) — a visitor's own "am I on
// this list" check goes through Constellation instead (see
// checkListMembership in ./constellation.js), which doesn't need this at
// all since it doesn't require reading the list's own membership.
//
// A list's listitems all live in the *owner's own repo* (each just points at
// the list and a subject DID), so "every member" is really "one person's
// whole listitem history" — pull it as a single com.atproto.sync.getRepo CAR
// (see ./car.js, copied from sites/backscroll) instead of paginating
// app.bsky.graph.getList a page of 100 at a time, same fix
// sites/blocksweep/sites/rollcall already use for "give me this list's whole
// membership." One CAR download answers "every member" in one request no
// matter the size. Falls back to paginated app.bsky.graph.getList when the
// CAR download itself fails (owner's PDS unreachable/non-CORS, oversized
// repo, malformed CAR).
export async function getListMembers(listUri, ownerDid) {
  try {
    const pds = await resolvePds(ownerDid);
    if (!pds) throw new Error("couldn't resolve the list owner's PDS");
    const { records } = await fetchRepoRecordsWithKeys(pds, ownerDid, "app.bsky.graph.listitem");
    const items = [];
    const seen = new Set();
    for (const { uri, value } of records) {
      if (value.list !== listUri || !value.subject || seen.has(value.subject)) continue;
      seen.add(value.subject);
      items.push({ uri, subject: { did: value.subject } });
    }
    return { items };
  } catch {
    const items = [];
    const seen = new Set();
    let cursor;
    for (let pages = 0; pages < LIST_FALLBACK_MAX_PAGES; pages++) {
      const u = new URL(`${PUB}/app.bsky.graph.getList`);
      u.searchParams.set("list", listUri);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const d = await jget(u.toString());
      for (const it of d.items || []) {
        const did = it.subject?.did;
        if (did && !seen.has(did)) {
          seen.add(did);
          items.push({ uri: it.uri, subject: it.subject });
        }
      }
      cursor = d.cursor;
      if (!cursor || !(d.items || []).length) break;
    }
    return { items };
  }
}

// Batch-resolves profiles (avatar, displayName, handle) for a list of DIDs.
// The CAR path above only knows members by DID, so this hydrates just the
// handful actually shown on screen (velvetrope's member list caps at 60)
// rather than every member of a possibly huge list. 25 actors/call is
// app.bsky.actor.getProfiles's own limit.
export async function hydrateProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    if (!batch.length) continue;
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, p);
    } catch {}
  }
  return out;
}

export function parseListUri(uri) {
  const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.graph\.list\/([^/]+)$/.exec(String(uri || ""));
  if (!m) return null;
  return { ownerDid: m[1], rkey: m[2] };
}

// --- bulk membership write (com.atproto.repo.applyWrites) ----------------
//
// Runs on the list OWNER's own session against their own PDS — nobody else
// can write app.bsky.graph.listitem records into that repo, which is the
// whole reason a bulk approve doesn't need any extra proof beyond "this
// dpopFetch succeeded." Chunked at 190 writes/call (atproto caps applyWrites
// at 200 per request).
const APPLY_WRITES_CHUNK = 190;

export async function applyListWrites(session, writes, dpopFetch) {
  const results = [];
  for (let i = 0; i < writes.length; i += APPLY_WRITES_CHUNK) {
    const chunk = writes.slice(i, i + APPLY_WRITES_CHUNK);
    const res = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.applyWrites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, writes: chunk }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `applyWrites failed (${res.status})`);
    results.push(body);
  }
  return results;
}

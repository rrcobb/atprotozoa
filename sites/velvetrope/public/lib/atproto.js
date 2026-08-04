// atproto.js — read-side AppView helpers (identity resolution, moderation
// lists, list membership) plus the one authenticated bulk-write helper this
// site needs (com.atproto.repo.applyWrites, for a list owner adding/removing
// members in one shot). Copy, don't abstract: trimmed from
// sites/paintmoot/public/lib/atproto.js, with the graph/list-specific bits
// added for velvetrope.

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
export async function getModLists(actorDid) {
  const out = [];
  let cursor;
  for (let p = 0; p < 10; p++) {
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

// One list's metadata + every member. Each item carries `uri` — the AT URI
// of the app.bsky.graph.listitem record itself — which is exactly what a
// list owner needs to delete a member later (rkey = last uri segment).
//
// capPages is a runaway-loop backstop, not a real limit — 20 pages (2000
// members) used to double as both, which silently truncated any list past
// that size (reported 2026-08-04: a member past #2000 read as "not on the
// list"). 2000 pages (200k members) is far past any real mod list.
export async function getListFull(listUri, capPages = 2000) {
  let list = null;
  const items = [];
  let cursor;
  for (let p = 0; p < capPages; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getList`);
    u.searchParams.set("list", listUri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    if (!list) list = d.list;
    for (const it of d.items || []) items.push(it);
    cursor = d.cursor;
    if (!cursor || !(d.items || []).length) break;
  }
  if (!list) throw new Error("list not found");
  return { list, items };
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

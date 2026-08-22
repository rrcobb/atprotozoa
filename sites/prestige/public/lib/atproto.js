// atproto.js — read-side helpers: identity resolution, PDS discovery, and
// public repo reads (getRecord/listRecords/getProfile).
//
// Copy, don't abstract: trimmed from padmoot/public/lib/atproto.js (drops
// the follows/moots graph stuff, which this site has no use for; re-adds
// getProfile, also from padmoot, since prestige needs follower counts).
// Everything here reads public, unauthenticated endpoints (the AppView +
// each user's own PDS) — no session needed. Writing (createRecord) stays in
// oauth.js's dpopFetch, called from index.html once a session exists.

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

// Forgiving handle/DID/URL parsing, copied from padmoot's resolveDid.
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

export async function resolveHandleForDid(did) {
  try {
    const doc = await didDoc(did);
    const aka = (doc?.alsoKnownAs || []).find((a) => a.startsWith("at://"));
    if (aka) return aka.slice("at://".length);
  } catch {}
  return did;
}

const pdsCache = new Map();
export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let pds = null;
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    pds = svc?.serviceEndpoint || null;
  } catch {}
  pdsCache.set(did, pds);
  return pds;
}

export async function getProfile(did) {
  try {
    return await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

// --- repo reads (public, unauthenticated XRPC on the owner's own PDS) -------

export async function getRecord(pdsUrl, repo, collection, rkey) {
  const params = new URLSearchParams({ repo, collection, rkey });
  return jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
}

// Page through listRecords, collecting records whose `value` passes `filter`
// (all records if omitted). `capPages` bounds how many 100-record pages we'll
// read from any one repo.
export async function listRecords(pdsUrl, repo, collection, filter, capPages = 5) {
  const out = [];
  let cursor;
  for (let p = 0; p < capPages; p++) {
    const params = new URLSearchParams({ repo, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d;
    try {
      d = await jget(
        `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`,
      );
    } catch {
      break;
    }
    const records = d.records || [];
    for (const rec of records) {
      if (!filter || filter(rec.value)) out.push(rec);
    }
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

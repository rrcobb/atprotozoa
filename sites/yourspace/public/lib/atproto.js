// atproto.js — read-side helpers: identity resolution, PDS discovery, and
// public repo reads (getRecord/listRecords).
//
// Copy, don't abstract: trimmed from paintmoot/public/lib/atproto.js (same
// repo) down to what keytags needs — no follow-graph/moots code here, since
// this site only ever reads and writes the signed-in user's own repo.
// Writing (putRecord/deleteRecord) stays in index.html, called via
// oauth.js's dpopFetch once a session exists.

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

// Forgiving handle/DID/URL parsing, copied from moot-bingo's resolveDid.
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

// --- repo reads (public, unauthenticated XRPC on the owner's own PDS) -------

export async function getRecord(pdsUrl, repo, collection, rkey) {
  const params = new URLSearchParams({ repo, collection, rkey });
  return jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
}

// One com.atproto.sync.getRepo CAR download gets every record in `collection`
// (with its real rkey, via an MST walk — see fetchRepoRecordsWithKeys) in a
// single request, no page cap — falls back to the old paginated listRecords
// walk (capped at capPages 100-record pages) if the CAR path fails (parse
// error, oversized repo, a PDS that blocks sync.getRepo).
export async function listRecords(pdsUrl, repo, collection, capPages = 5) {
  try {
    const { records } = await fetchRepoRecordsWithKeys(pdsUrl, repo, collection);
    return records;
  } catch {
    return listRecordsViaWalk(pdsUrl, repo, collection, capPages);
  }
}

async function listRecordsViaWalk(pdsUrl, repo, collection, capPages) {
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
    out.push(...records);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

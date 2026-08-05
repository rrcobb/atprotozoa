// atproto.js — read-side helpers: identity resolution, PDS discovery, and a
// full-history repo read (every app.bsky.feed.post record this account has
// ever written, with its real rkey/uri, not a capped recent sample).
//
// Copy, don't abstract: trimmed from sites/padmoot/public/lib/atproto.js —
// this site only reads, so the OAuth/moots/graph helpers there are dropped.

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
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

// Every app.bsky.feed.post record this account has ever written, each with
// its real `uri` — a single repo CAR download + MST walk (see car.js), with
// a paginated com.atproto.repo.listRecords walk as the fallback if the CAR
// path fails (parse error, oversized repo, a PDS that blocks sync.getRepo).
export async function listAllPosts(pdsUrl, did, onProgress) {
  try {
    const { records } = await fetchRepoRecordsWithKeys(pdsUrl, did, "app.bsky.feed.post", onProgress);
    return { posts: records, full: true };
  } catch {
    return { posts: await listRecordsViaWalk(pdsUrl, did, onProgress), full: false };
  }
}

const WALK_MAX_PAGES = 300; // <= ~30,000 posts — generous, this is a "your whole history" tool

async function listRecordsViaWalk(pdsUrl, did, onProgress) {
  const out = [];
  let cursor;
  for (let p = 0; p < WALK_MAX_PAGES; p++) {
    const params = new URLSearchParams({ repo: did, collection: "app.bsky.feed.post", limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d;
    try {
      d = await jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`);
    } catch {
      break;
    }
    const records = d.records || [];
    for (const rec of records) out.push({ uri: rec.uri, value: rec.value });
    if (onProgress) onProgress(`paging your repo... ${out.length} posts so far`);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

// Batched, hydrated post lookup (likeCount/still-exists/thread-context) —
// same public, unauthenticated endpoint sites/ratioed and sites/quotehof
// use. Returns a Map uri -> hydrated post view (missing entries = deleted,
// or not yet indexed).
export async function getPosts(uris) {
  const out = new Map();
  const batches = [];
  for (let i = 0; i < uris.length; i += 25) batches.push(uris.slice(i, i + 25));
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const u = new URL(`${PUB}/app.bsky.feed.getPosts`);
        for (const uri of batch) u.searchParams.append("uris", uri);
        const d = await jget(u.toString());
        for (const p of d.posts || []) out.set(p.uri, p);
      } catch {
        // one bad batch shouldn't sink the scan — those uris just stay unenriched
      }
    }),
  );
  return out;
}

export function postUrl(uri, handle) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${encodeURIComponent(handle || m[1])}/post/${m[2]}`;
}

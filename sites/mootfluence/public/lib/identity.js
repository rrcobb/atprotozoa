// identity.js — handle/DID resolution, profile lookups, and PDS resolution.
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth). Copied and trimmed from sites/kevinmoot/lib/identity.js
// (copy, don't abstract).

const PUB = "https://api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";

// Small localStorage-backed cache for values that rarely change but get
// re-looked-up constantly (a handle's DID, a DID's PDS host).
const LS_PREFIX = "mootfluence:v1:";

function lsGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    const { ts, v } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) return undefined;
    return v;
  } catch {
    return undefined;
  }
}

function lsSet(key, v) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ ts: Date.now(), v }));
  } catch {
    // storage disabled (private browsing) or quota exceeded — caching is an
    // optimization, not a requirement, so just skip it
  }
}

const HANDLE_TTL_MS = 24 * 60 * 60 * 1000;
const PDS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving about paste formats — handle, @mention, profile URL, at:// URI, DID.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const cacheKey = "handle:" + a.toLowerCase();
  const cached = lsGet(cacheKey, HANDLE_TTL_MS);
  if (cached) return cached;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  lsSet(cacheKey, d.did);
  return d.did;
}

export const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return profileOf(p);
}

// Batch-fetch profiles, 25 actors per request (AppView's cap).
export async function getProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — missing profiles just render as bare DIDs
    }
  }
  return out;
}

const pdsCache = new Map(); // did -> serviceEndpoint | null

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
  if (pdsCache.has(did)) return pdsCache.get(did);
  const cached = lsGet("pds:" + did, PDS_TTL_MS);
  if (cached) {
    pdsCache.set(did, cached);
    return cached;
  }
  let endpoint = null;
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    endpoint = svc?.serviceEndpoint || null;
  } catch {
    endpoint = null;
  }
  pdsCache.set(did, endpoint);
  if (endpoint) lsSet("pds:" + did, endpoint);
  return endpoint;
}

// Run `fn` over `items` with at most `limit` in flight at once.
export async function pooledEach(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
}

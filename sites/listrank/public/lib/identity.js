// identity.js — handle -> DID resolution, PDS lookup (needed for the repo
// CAR download in car.js), and a tiny fetch pool helper. Trimmed from
// sites/kevinmoot/public/lib/identity.js (copy, don't abstract) — this site
// never writes, so the OAuth bits that copy doesn't have either stay out too.

const PUB = "https://public.api.bsky.app/xrpc";

export function cleanHandle(raw) {
  let h = decodeURIComponent(String(raw || "")).trim();
  h = h.replace(/^@/, "").replace(/^at:\/\//, "").replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "");
  return h.split("/")[0];
}

export async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.json()).message || ""; } catch {}
    const e = new Error(`HTTP ${r.status}${detail ? ": " + detail : ""}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveHandle(rawHandle) {
  const handle = cleanHandle(rawHandle);
  if (!handle) throw new Error("enter a handle");
  const did = handle.startsWith("did:") ? handle : (await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)).did;
  let profile = null;
  try {
    profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    // cosmetic only — a resolved DID is enough to keep going without it
  }
  return { did, handle: (profile && profile.handle) || handle, profile };
}

const pdsCache = new Map(); // did -> serviceEndpoint | null

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let endpoint = null;
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await jget(`https://${host}/.well-known/did.json`);
    } else {
      doc = await jget(`https://plc.directory/${encodeURIComponent(did)}`);
    }
    const svc = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
    endpoint = (svc && svc.serviceEndpoint) || null;
  } catch {
    endpoint = null;
  }
  pdsCache.set(did, endpoint);
  return endpoint;
}

// Batch-resolve handles for a sample of DIDs, 25 actors per request (the
// AppView's own cap on app.bsky.actor.getProfiles) — used to estimate the
// .bsky.social share of a list's membership without resolving every member.
export async function getHandles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, p.handle);
    } catch {
      // a failed batch just leaves those DIDs unresolved — the share
      // estimate is a sample already, a few missing handles don't matter
    }
  }
  return out;
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

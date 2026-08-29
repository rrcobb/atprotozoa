// identity.js — batch DID -> handle resolution for the public review list on
// a site's detail page. Trimmed from sites/kevinmoot/public/lib/identity.js
// (copy, don't abstract) down to just the getProfiles batching + a small
// localStorage cache; this site has no follow-graph walking to do.

const PUB = "https://api.bsky.app/xrpc";
const LS_PREFIX = "rateyourbuild:identity:v1:";
const HANDLE_TTL_MS = 24 * 60 * 60 * 1000; // handle rarely changes day-to-day

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    const { ts, v } = JSON.parse(raw);
    if (Date.now() - ts > HANDLE_TTL_MS) return undefined;
    return v;
  } catch {
    return undefined;
  }
}

function lsSet(key, v) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ ts: Date.now(), v }));
  } catch {
    // private browsing / full storage — caching is an optimization only
  }
}

// Batch-fetch profiles, 25 actors per request (AppView's cap). Returns a
// Map of did -> {did, handle, displayName}; a DID that couldn't be resolved
// (deleted account, rate limit) is simply absent from the map.
export async function getProfiles(dids) {
  const out = new Map();
  const uncached = [];
  for (const did of dids) {
    const cached = lsGet(did);
    if (cached) out.set(did, cached);
    else uncached.push(did);
  }
  for (let i = 0; i < uncached.length; i += 25) {
    const batch = uncached.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const r = await fetch(u.toString());
      if (!r.ok) continue;
      const d = await r.json();
      for (const p of d.profiles || []) {
        const entry = { did: p.did, handle: p.handle, displayName: p.displayName || p.handle };
        out.set(p.did, entry);
        lsSet(p.did, entry);
      }
    } catch {
      // partial data is fine — unresolved DIDs just render shortened
    }
  }
  return out;
}

// Resolves one handle *or* DID to a full profile — getProfile accepts
// either, so the reviewer page (see index.html) can turn whatever a person
// typed or whatever's in a review row into a canonical {did, handle}
// without a separate resolveHandle round trip. Cached under its own key
// (not the by-did cache above) since the input string itself is the lookup.
export async function resolveActor(actor) {
  const key = "actor:" + actor.toLowerCase();
  const cached = lsGet(key);
  if (cached !== undefined) return cached;
  try {
    const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
    if (!r.ok) {
      lsSet(key, null);
      return null;
    }
    const p = await r.json();
    const entry = { did: p.did, handle: p.handle, displayName: p.displayName || p.handle };
    lsSet(key, entry);
    lsSet(entry.did, entry);
    return entry;
  } catch {
    return null;
  }
}

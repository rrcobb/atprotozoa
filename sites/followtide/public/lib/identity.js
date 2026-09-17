// identity.js — handle resolution, profile lookup, and PDS lookup. Trimmed
// from sites/mootflow/public/lib/identity.js (copy, don't abstract): followtide
// doesn't classify relationships, so followGraph/classify/profilesFor aren't
// needed here.

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from mootgrinder/moots.js resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function getProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

// did:web isn't handled here — followtide only needs the PDS for a single
// account's own repo, and did:plc covers the overwhelming majority of real
// accounts. did:web resolution is in backscroll's identity.js if this ever
// needs to widen.
const pdsCache = new Map();
export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let endpoint = null;
  try {
    const doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
    const svc = (doc.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    endpoint = (svc && svc.serviceEndpoint) || null;
  } catch (_) {
    endpoint = null;
  }
  pdsCache.set(did, endpoint);
  return endpoint;
}

// Batched app.bsky.actor.getProfiles — up to 25 actors per call, the
// AppView's cap. Used to resolve handles/display names for a month bucket's
// members on demand (only when someone expands a bucket), not eagerly for
// every follow.
export async function profilesFor(dids) {
  const uniq = [...new Set(dids)];
  const out = new Map();
  for (let i = 0; i < uniq.length; i += 25) {
    const batch = uniq.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, p);
    } catch (_) {
      // best-effort — a missing profile just falls back to a bare DID label
    }
  }
  return out;
}

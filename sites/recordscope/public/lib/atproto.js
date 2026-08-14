// atproto.js — read-side helpers: identity resolution, PDS discovery, and
// public record/blob reads straight off a repo's own PDS. Everything here
// hits public, unauthenticated endpoints — no session needed, this site
// never writes anything.
//
// Copy, don't abstract: trimmed from sites/vulnscope/public/lib/atproto.js,
// with getRecord/getBlob added for recordscope's own use.

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

// Forgiving handle/DID/URL parsing, copied from vulnscope's resolveDid.
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
  try {
    return await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

// --- repo reads (public, unauthenticated XRPC on the owner's own PDS) -----

export async function getRecord(pdsUrl, repo, collection, rkey) {
  const params = new URLSearchParams({ repo, collection, rkey });
  return jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
}

// Blobs (e.g. a whtwnd blog entry's markdown body) live off-record, fetched
// by CID from the same PDS. Returns the raw Response so callers can read
// .text() or .blob() depending on what the record says the mimeType is.
export async function getBlob(pdsUrl, did, cid) {
  const params = new URLSearchParams({ did, cid });
  const r = await fetch(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?${params}`);
  if (!r.ok) throw new Error(`blob fetch HTTP ${r.status}`);
  return r;
}

// atproto.js — read-side helpers: identity resolution, PDS discovery, and
// public repo reads (getRecord/listRecords) against a user's own PDS.
//
// Copy, don't abstract: trimmed from sites/padmoot/public/lib/atproto.js —
// dropped the CAR-file bulk-read path (car.js) and the graph/moots helpers,
// neither of which commonplace needs. A person's own site.standard.publication
// list is small, so the plain paginated com.atproto.repo.listRecords walk is
// plenty; writing (createRecord/uploadBlob) stays in oauth.js's dpopFetch,
// called from index.html once a session exists.

const PLC_DIR = "https://plc.directory";
const BSKY_PUBLIC_API = "https://api.bsky.app";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveHandle(handle) {
  const r = await fetch(
    `${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  if (!r.ok) return null;
  return (await r.json()).did || null;
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

// DID -> handle, via the DID doc's alsoKnownAs (`at://<handle>`). Reliable
// across did:plc and did:web; falls back to the DID string if nothing's found.
export async function resolveHandleForDid(did) {
  try {
    const doc = await didDoc(did);
    const aka = (doc?.alsoKnownAs || []).find((a) => a.startsWith("at://"));
    if (aka) return aka.slice("at://".length);
  } catch {}
  return did;
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

export async function getRecord(pdsUrl, repo, collection, rkey) {
  const params = new URLSearchParams({ repo, collection, rkey });
  return jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
}

// Paginated, unauthenticated com.atproto.repo.listRecords walk. Caps at
// capPages*100 records — plenty for "list my own publications/documents",
// which is never going to be a firehose-scale collection.
export async function listRecords(pdsUrl, repo, collection, capPages = 10) {
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

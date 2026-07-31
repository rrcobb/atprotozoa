// identity.js — resolve an account's PDS from its DID document, so the full
// repo (all their posts + likes, not a capped recent-history sample) can be
// pulled straight from the source over com.atproto.sync.getRepo. Copied and
// trimmed from sites/metamoots's lib/identity.js (copy, don't abstract) —
// beefcheck only needs the PDS lookup and the URI->DID helper, not that
// file's follow-graph/profile-batch machinery.

const pdsCache = new Map(); // did -> serviceEndpoint | null

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let endpoint = null;
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
    } else {
      doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
    }
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

// Extract the author DID embedded in an at:// record/post URI.
export function authorFromUri(uri) {
  const m = /^at:\/\/([^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

// identity.js — resolve an account's PDS from its DID document, so the full
// repo (every post they've ever made, not a capped recent-history sample)
// can be pulled straight from the source over com.atproto.sync.getRepo.
// Copied and trimmed from sites/beefcheck's lib/identity.js (copy, don't
// abstract) — ngmi only needs the PDS lookup, not a URI->DID helper.

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

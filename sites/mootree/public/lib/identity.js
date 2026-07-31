// identity.js — public, no-auth handle/DID/PDS resolution for mootree.bisks.net.
//
// mootree never needs to prove "who you are" — every read it does (follow
// records, profiles) is public atproto data, readable for any DID without a
// token. This file is what's left of the old oauth.js after the login flow
// was dropped: just the handle <-> DID <-> PDS plumbing, still needed to
// turn a typed-in handle into somewhere to read from.

const BSKY_PUBLIC_API = "https://api.bsky.app";
const PLC_DIR = "https://plc.directory";

export async function resolveHandle(handle) {
  const r = await fetch(
    `${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  if (!r.ok) return null;
  return (await r.json()).did || null;
}

// DID -> handle, via the DID doc's alsoKnownAs (`at://<handle>`). Reliable across
// did:plc and did:web; falls back to the DID string if nothing's found.
export async function resolveHandleForDid(did) {
  try {
    let doc = null;
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (r.ok) doc = await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").replace(/:/g, "/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) doc = await r.json();
    }
    const aka = (doc?.alsoKnownAs || []).find((a) => a.startsWith("at://"));
    if (aka) return aka.slice("at://".length);
  } catch {}
  return did;
}

export async function resolvePds(did) {
  try {
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (r.ok) {
        const doc = await r.json();
        const pds = (doc.service || []).find(
          (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
        );
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").replace(/:/g, "/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) {
        const doc = await r.json();
        const pds = (doc.service || []).find(
          (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
        );
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }
  } catch {}
  return null;
}

// Resolve a handle or DID to { did, handle, pdsUrl } — no login, ever. This is
// the only identity mootree needs: viewing *anyone's* tree (including your
// own) is the same public read either way.
export async function resolvePublicActor(handleOrDid) {
  const raw = handleOrDid.trim();
  const did = raw.startsWith("did:") ? raw : await resolveHandle(raw);
  if (!did) throw new Error(`could not resolve "${raw}"`);
  const [handle, pdsUrl] = await Promise.all([
    raw.startsWith("did:") ? resolveHandleForDid(did) : Promise.resolve(raw.replace(/^@/, "")),
    resolvePds(did),
  ]);
  if (!pdsUrl) throw new Error(`could not find a PDS for ${did}`);
  return { did, handle, pdsUrl };
}

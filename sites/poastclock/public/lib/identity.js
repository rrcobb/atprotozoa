// identity.js — handle resolution + profile lookup. Trimmed from
// sites/followtide/public/lib/identity.js (copy, don't abstract): poastclock
// never needs an arbitrary account's PDS (the only repo it downloads is
// bsky.app's own, fetched directly in app.js), so resolvePds/profilesFor
// aren't needed here.

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

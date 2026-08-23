// identity.js — resolve a handle to a DID and batch-fetch profiles. Reads
// Bluesky's PUBLIC AppView anonymously (api.bsky.app, CORS *, no auth).
// Trimmed from metamoots/lib/identity.js (copy, don't abstract) — this site
// never needs follow graphs or PDS resolution, just handle→DID and profiles.

const PUB = "https://api.bsky.app/xrpc";

export async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from neighborhood/hood.js resolveDid.
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

// Batch-fetch profiles, 25 actors per request (AppView's cap), a few
// batches in flight at once so a huge liker list (thousands of DIDs) still
// resolves in reasonable time instead of one request at a time.
export async function getProfiles(dids) {
  const out = new Map();
  const batches = [];
  for (let i = 0; i < dids.length; i += 25) batches.push(dids.slice(i, i + 25));
  await pooledEach(batches, 6, async (batch) => {
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — missing profiles just render as bare DIDs
    }
  });
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

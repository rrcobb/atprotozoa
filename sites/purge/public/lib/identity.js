// identity.js — resolve a handle to a DID, fetch its full follows +
// followers, and batch-resolve profiles. Everything here reads Bluesky's
// PUBLIC AppView anonymously (api.bsky.app, CORS *, no auth). Copied and
// trimmed from metamoots/lib/identity.js (copy, don't abstract) — purge
// doesn't need metamoots' resolvePds/authorFromUri, since it never reads a
// PDS's own repo, only the public getLikes/getPostThread endpoints.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // <= ~1200 follows / ~1200 followers scanned

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

// Batch-fetch profiles, 25 actors per request (AppView's cap).
export async function getProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — missing profiles just render as bare DIDs
    }
  }
  return out;
}

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// follows ∩ followers — the people `did` follows who follow them back.
export async function mutualsOf(did, onStep) {
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);
  const followerSet = new Set(followers);
  const mutuals = follows.filter((d) => followerSet.has(d));
  return { follows, followers, mutuals };
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

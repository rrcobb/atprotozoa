// follows.js — turn a Bluesky handle into the list of accounts it follows,
// with each account's follower count (for sizing) and avatar/name (for the
// break-up reveal). Everything reads Bluesky's PUBLIC AppView anonymously
// (api.bsky.app, CORS *, no auth). Trimmed from grand-moot-auto/pacmoot's
// lib/cluster.js (itself from mootdrone/clustercrawl/simcluster) down to
// just the follows edge — copy, don't abstract.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows scanned

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
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
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
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Batch-fetch full profiles (bio, counts) for up to 25 DIDs at a time —
// app.bsky.actor.getProfiles caps at 25 actors per call.
export async function getProfiles(dids) {
  const out = [];
  for (let i = 0; i < dids.length; i += 25) {
    const chunk = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of chunk) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.push(p);
    } catch {}
  }
  return out;
}

// Resolve a handle to { did, handle, self, follows } where each entry of
// `follows` is { did, handle, displayName, avatar, followersCount }.
export async function loadFollows(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (!follows.length) {
    return { did, handle: actor.replace(/^@/, ""), self: null, follows: [] };
  }

  if (onStep) onStep(`loading ${follows.length} follower counts…`);
  const profiles = await getProfiles([did, ...follows.map((f) => f.did)]);
  const byDid = new Map(profiles.map((p) => [p.did, p]));

  const selfP = byDid.get(did);
  const self = {
    did,
    handle: selfP?.handle || actor.replace(/^@/, ""),
    displayName: selfP?.displayName || selfP?.handle || actor.replace(/^@/, ""),
    avatar: selfP?.avatar || "",
  };

  const seen = new Set([did]);
  const out = [];
  for (const f of follows) {
    if (seen.has(f.did)) continue;
    seen.add(f.did);
    const p = byDid.get(f.did) || {};
    out.push({
      did: f.did,
      handle: p.handle || f.handle,
      displayName: p.displayName || p.handle || f.handle,
      avatar: p.avatar || f.avatar || "",
      followersCount: p.followersCount || 0,
    });
  }

  return { did, handle: self.handle, self, follows: out };
}

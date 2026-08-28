// moots.js — who's in the horde. Trimmed from sites/mootrider/public/lib/cluster.js
// (itself from pacmoot/mootdrone/clustercrawl/simcluster — copy, don't
// abstract). Reads Bluesky's PUBLIC AppView anonymously (api.bsky.app, CORS
// *, no auth) — the mutual-follow graph is public data, so this doesn't need
// the player's OAuth session at all. Only the per-post unliked check
// (game.js's loadZombies) needs the authenticated proxy.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)
const MIN_POOL = 6; // below this, widen mutuals → follows so the town isn't empty

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

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

// Resolve a DID to its horde: { did, pool, kind, counts }. `pool` is moots
// (mutuals) without self, widened to plain follows if the mutual set is too
// small to stock a town.
export async function moots(did, { onStep } = {}) {
  if (onStep) onStep("mapping who you follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows you back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  const mutualCount = mutuals.length;
  let kind = "moots";
  const pool = mutuals.slice();
  if (pool.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "moots + follows";
  }

  return {
    did,
    pool,
    kind,
    counts: {
      follows: follows.length,
      followers: followers.length,
      mutuals: mutualCount,
      pool: pool.length,
    },
  };
}

// Batch-fetch full profiles (avatar, displayName) for up to 25 DIDs at a
// time — app.bsky.actor.getProfiles caps at 25 actors per call.
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

// simstats.js — the one real number this site needs: a handle's SimCluster
// mutual rate (of who you follow, what fraction follows back). Trimmed copy
// of sites/simcluster-gacha/public/lib/cluster.js's resolve/page helpers
// (copy, don't abstract) — dropped the profile-hydration pass since this
// only ever plots counts, never a card pool.
//
// Reads Bluesky's public AppView anonymously (api.bsky.app, CORS *):
// resolveHandle, getProfile, getFollows, getFollowers.

const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

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

async function graphAllDids(endpoint, key, did) {
  const out = new Set();
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
    for (const it of d[key] || []) out.add(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle into { handle, displayName, avatar, followsTotal,
// followersTotal, mutuals, mutualRate, truncated }. mutualRate is
// mutuals / min(followsTotal, follows-scanned) as a 0-100 number — the
// fraction of the accounts this handle follows that follow back.
export async function buildStats(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("looking up the profile...");
  const profile = await jget(
    `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  );

  if (onStep) onStep("finding who they follow...");
  const follows = await graphAllDids("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back...");
  const followers = await graphAllDids("app.bsky.graph.getFollowers", "followers", did);

  let mutuals = 0;
  for (const d of follows) if (followers.has(d)) mutuals++;

  const scanned = follows.size;
  const mutualRate = scanned > 0 ? Math.round((mutuals / scanned) * 1000) / 10 : 0;
  const truncated = (profile.followsCount || 0) > scanned || (profile.followersCount || 0) > followers.size;

  return {
    did,
    handle: profile.handle,
    displayName: profile.displayName || profile.handle,
    avatar: profile.avatar || "",
    followsTotal: profile.followsCount || 0,
    followersTotal: profile.followersCount || 0,
    scanned,
    mutuals,
    mutualRate,
    truncated,
  };
}

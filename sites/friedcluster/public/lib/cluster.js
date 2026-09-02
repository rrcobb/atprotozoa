// cluster.js — turn a Bluesky handle into its SimCluster: self + moots
// (mutuals), each hydrated with a real avatar and followersCount so the fry
// grid can sort the most-recognizable faces first.
//
// moots = MUTUALS: accounts the handle follows that follow back
// (follows ∩ followers). Widens to plain follows if the mutual pool is thin,
// same fallback as sites/simcluster. Everything here reads Bluesky's PUBLIC
// AppView anonymously (api.bsky.app, CORS *, no auth): resolveHandle,
// getFollows, getFollowers, getProfiles. Copied from
// sites/simcluster-gacha/public/lib/cluster.js (copy, don't abstract).

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — see moot-family sites' shared history: a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound
const MIN_POOL = 15; // below this, widen mutuals -> follows so there's enough to fry
const MAX_POOL = 120; // cap profile-hydration calls (5x getProfiles batches of 25) — a real API-shape limit, not a caution default

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
// formats — copied from simcluster/moots.js resolveDid.
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

const thinProfile = (p) => ({ did: p.did, handle: p.handle });

// Page through a graph endpoint (getFollows / getFollowers), collecting the
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays fast.
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

const fullProfileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
  followersCount: p.followersCount || 0,
});

// Batch-hydrate a list of thin {did} entries into full profiles via
// app.bsky.actor.getProfiles (max 25 actors/call). Silently drops any DID
// that fails to resolve (suspended/deleted accounts) rather than failing the
// whole cluster.
async function hydrate(thin) {
  const out = [];
  for (let i = 0; i < thin.length; i += 25) {
    const batch = thin.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const t of batch) u.searchParams.append("actors", t.did);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.push(fullProfileOf(p));
    } catch {
      // one batch failing shouldn't sink the whole cluster
    }
  }
  return out;
}

// Resolve a handle into a SimCluster. Returns:
//   { did, handle, self, pool: [fullProfile...], kind, counts }
// `self` and every entry in `pool` carry a real avatar + followersCount.
// `pool` never contains self.
export async function buildCluster(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("looking up the profile…");
  const selfRaw = await jget(
    `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  );
  const self = fullProfileOf(selfRaw);

  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]); // never let self slip into the pool
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(thinProfile(f));
  }

  const mutualCount = mutuals.length;
  let kind = "moots";
  let thin = mutuals.slice();
  if (thin.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      thin.push(thinProfile(f));
    }
    if (thin.length > mutualCount) kind = "moots + follows";
  }
  const truncated = thin.length > MAX_POOL;
  thin = thin.slice(0, MAX_POOL);

  if (onStep) onStep(`hydrating ${thin.length} faces…`);
  const pool = await hydrate(thin);
  pool.sort((a, b) => b.followersCount - a.followersCount);

  return {
    did,
    handle: self.handle,
    self,
    pool,
    kind,
    counts: {
      follows: follows.length,
      followers: followers.length,
      mutuals: mutualCount,
      pool: pool.length,
      truncated,
    },
  };
}

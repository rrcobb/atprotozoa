// network.js — turn a Bluesky handle into its network: everyone they follow
// UNION everyone who follows them (not just mutuals — the ask was "their
// followers and who they're following"). Reads Bluesky's PUBLIC AppView
// anonymously (public.api.bsky.app, CORS *, no auth): resolveHandle,
// getFollows, getFollowers, getProfile. Graph-walking half copied+trimmed
// from cloutgraph/lib/pool.js and dial-a-mutual/lib/moots.js (copy, don't
// abstract).

const PUB = "https://public.api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // <= ~1200 follows + ~1200 followers scanned per side
// The day-scan (scan.js) runs entirely in the visitor's browser, hitting the
// anonymous public AppView once per pool member (more if they're prolific —
// see FEED_PAGES). There's no cheap "did they post yesterday" signal to
// filter the pool first, so the cap is just a bound on how many feed fetches
// one page load is willing to fan out — raised from 250 after a network of
// ~700 (dave.9000ish.uk, 2026-07-29) got truncated well before anything
// resembling "the whole network" was scanned.
export const MAX_POOL = 800;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export function cleanHandle(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

export async function resolveDid(actor) {
  const a = cleanHandle(actor);
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
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

// Resolve a handle to its network. Returns:
//   { did, self: {did,handle,displayName,avatar},
//     pool: [{did,handle,displayName,avatar}],
//     followingCount, followerCount, totalFound, truncated }
// `pool` is follows UNION followers, self excluded, capped at MAX_POOL.
export async function resolveNetwork(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("counting who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("counting who follows them…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  let self = {
    did,
    handle: cleanHandle(actor),
    displayName: cleanHandle(actor),
    avatar: "",
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
  } catch {}

  const seen = new Set([did]);
  const full = [];
  for (const p of [...follows, ...followers]) {
    if (seen.has(p.did)) continue;
    seen.add(p.did);
    full.push(profileOf(p));
  }

  const pool = full.slice(0, MAX_POOL);

  return {
    did,
    self,
    pool,
    followingCount: follows.length,
    followerCount: followers.length,
    totalFound: full.length,
    truncated: full.length > pool.length,
  };
}

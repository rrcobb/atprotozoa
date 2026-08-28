// graph.js — the real Bluesky graph a handle's SimCluster quiz gets built
// from. Wider than moots.js (simcluster/simclash/toroidarium): those only
// ever need the mutual pool, but a quiz that asks "is THIS a real moot of
// yours?" needs the one-way sets too, as real (not made-up) wrong answers —
// people you follow who don't follow back, and people who follow you that
// you don't follow. Copied and widened from
// sites/simclash/public/lib/moots.js, itself from moot-bingo/neighborhood
// (copy, don't abstract).
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getProfile,
// getAuthorFeed.

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

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from moots.js resolveDid.
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

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return profileOf(p);
}

// A handful of real, stable, well-known Bluesky accounts (the same ones
// biskshow's placeholders point at) to pad decoy pools when a handle's own
// graph is too sparse to supply enough real wrong answers on its own.
const FALLBACK_HANDLES = ["bsky.app", "jay.bsky.team", "pfrazee.com"];

export async function fallbackAccounts(excludeDids = new Set()) {
  const out = [];
  for (const h of FALLBACK_HANDLES) {
    try {
      const did = await resolveDid(h);
      if (excludeDids.has(did)) continue;
      out.push(await getProfile(did));
    } catch {}
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
    for (const it of d[key] || []) out.push(profileOf(it));
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle to its full real graph. Returns:
//   { did, self, follows, followers, moots, followsOnly, followedByOnly, counts }
// - moots: follows ∩ followers (real mutuals)
// - followsOnly: you follow them, they don't follow you back
// - followedByOnly: they follow you, you don't follow them back
// All three are disjoint, real, and verifiable — good decoy/answer material
// for a quiz that has to be about actual things, not invented ones.
export async function loadGraph(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  let self = { did, handle: actor.replace(/^@/, ""), displayName: actor.replace(/^@/, ""), avatar: "" };
  try {
    self = await getProfile(did);
  } catch {}

  const followDids = new Set(follows.map((f) => f.did));
  const followerDids = new Set(followers.map((f) => f.did));

  const moots = [];
  const followsOnly = [];
  for (const f of follows) {
    if (f.did === did) continue;
    if (followerDids.has(f.did)) moots.push(f);
    else followsOnly.push(f);
  }
  const followedByOnly = followers.filter((f) => f.did !== did && !followDids.has(f.did));

  return {
    did,
    self,
    follows,
    followers,
    moots,
    followsOnly,
    followedByOnly,
    counts: {
      follows: follows.length,
      followers: followers.length,
      moots: moots.length,
      followsOnly: followsOnly.length,
      followedByOnly: followedByOnly.length,
    },
  };
}

// The single most recent top-level post timestamp for an account (or null).
// Used for "who posted more recently" questions — a real, checkable event.
export async function lastPostAt(did) {
  try {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "10");
    u.searchParams.set("filter", "posts_no_replies");
    const d = await jget(u.toString());
    for (const it of d.feed || []) {
      if (it.reason) continue; // skip reposts
      const rec = it.post && it.post.record;
      if (rec && rec.createdAt) return new Date(rec.createdAt).getTime();
    }
  } catch {}
  return null;
}

// moots.js — turn a Bluesky handle into its moots (mutuals — follows ∩
// followers). Reads Bluesky's PUBLIC AppView anonymously
// (public.api.bsky.app, CORS *, no auth): resolveHandle, getFollows,
// getFollowers, getProfile. Copied+trimmed from dial-a-mutual/lib/moots.js
// (copy, don't abstract) — this site doesn't need latestPost.

import { followerDids as constellationFollowerDids } from "./microcosm.js";

const PUB = "https://public.api.bsky.app/xrpc";

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

// Resolve a handle to its moots. Returns:
//   { did, handle, self, pool: [{did,handle,displayName,avatar}] }
// `pool` excludes self and is capped at 300 (plenty of moots to vaporize).
export async function moots(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  // Constellation indexes app.bsky.graph.follow's .subject directly (up to
  // 1000/page vs the AppView's 100/page), so it's tried first; the AppView
  // walk is the fallback if Constellation itself errors. Only DIDs are
  // needed here (membership test against follows), so no profile hydration
  // either way.
  let followerIds;
  try {
    followerIds = await constellationFollowerDids(did);
  } catch {
    followerIds = (await graphAll("app.bsky.graph.getFollowers", "followers", did)).map(
      (f) => f.did,
    );
  }

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

  const followerDids = new Set(followerIds);
  const seen = new Set([did]);
  const pool = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    pool.push(profileOf(f));
  }

  return { did, handle: self.handle, self, pool: pool.slice(0, 300) };
}

// followers.js — resolve a handle, fetch its profile, and read its full
// follower list. Reads Bluesky's public AppView anonymously
// (public.api.bsky.app, CORS *). Handle-resolution copied from
// sites/clucktrack/public/lib/history.js (copy, don't abstract).
//
// Followers come from microcosm.blue's Constellation (a backlink index:
// every app.bsky.graph.follow record whose subject is this DID, read to
// exhaustion in one bulk call via lib/microcosm.js), with the AppView's
// paginated getFollowers as the fallback when Constellation errors.

import { followerDids } from "./microcosm.js";

const PUB = "https://public.api.bsky.app/xrpc";

// Backstop for the AppView fallback walk only — Constellation is the primary
// path and reads to exhaustion. 400 pages matches kevinmoot's FOLLOWERS_PAGES:
// large enough that a real account never hits it, just a guard against a
// runaway loop if the AppView misbehaves.
const MAX_PAGES = 400;

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

export async function fetchProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    description: p.description || "",
    followersCount: p.followersCount || 0,
    followingCount: p.followsCount || 0,
    postsCount: p.postsCount || 0,
  };
}

// Profiles are only used for what's displayed (handle, name, avatar, bio),
// so DIDs from Constellation are hydrated via getProfiles, 25 per call
// (microcosm.js's own hydration guidance).
async function hydrateProfiles(dids, onStep) {
  const out = [];
  for (let i = 0; i < dids.length; i += 25) {
    if (onStep) onStep(`loading profiles… (${Math.min(i + 25, dids.length)} of ${dids.length})`);
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      continue;
    }
    for (const p of d.profiles || []) {
      out.push({
        did: p.did,
        handle: p.handle,
        displayName: p.displayName || p.handle,
        avatar: p.avatar || "",
        description: p.description || "",
      });
    }
  }
  return out;
}

// Every follower of `did`. Fallback walk is newest-first (the order the
// AppView returns); Constellation's order is whatever the index returns.
async function fetchFollowersAppView(did, { onStep } = {}) {
  const followers = [];
  let cursor = "";
  for (let pg = 0; pg < MAX_PAGES; pg++) {
    if (onStep) onStep(`reading followers… (page ${pg + 1}, ${followers.length} found so far)`);
    const u = new URL(`${PUB}/app.bsky.graph.getFollowers`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const f of d.followers || []) {
      followers.push({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName || f.handle,
        avatar: f.avatar || "",
        description: f.description || "",
      });
    }
    cursor = d.cursor;
    if (!cursor || !(d.followers || []).length) break;
  }
  return followers;
}

export async function fetchFollowers(did, { onStep } = {}) {
  try {
    const dids = await followerDids(did, {
      onStep: (n) => onStep && onStep(`reading followers… (${n} found so far)`),
    });
    return await hydrateProfiles(dids, onStep);
  } catch {
    return fetchFollowersAppView(did, { onStep });
  }
}

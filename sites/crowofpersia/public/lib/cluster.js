// cluster.js — pulls the guard roster: everyone @norvid-studies.bsky.social
// follows on Bluesky, with avatars, so the dungeon guards wear real faces.
// Reads the PUBLIC AppView anonymously (api.bsky.app, CORS *, no auth):
// resolveHandle, getFollows, getProfiles. Trimmed from pacmoot/lib/cluster.js
// (itself from mootdrone/clustercrawl/simcluster) — copy, don't abstract.
// Unlike those, this one doesn't need followers/mutuals: the brief asks for
// "guards drawn from pfps of users followed by @norvid-studies.bsky.social",
// i.e. plain follows, not the mutuals intersection.

const PUB = "https://api.bsky.app/xrpc";

export const GUARD_ACTOR = "norvid-studies.bsky.social";

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

async function resolveDid(actor) {
  const a = (actor || "").trim().replace(/^@/, "");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function allFollows(did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getFollows`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d.follows || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Returns { did, handle, guards: [{did,handle,displayName,avatar}], captain }
// — the full follow list of GUARD_ACTOR, self excluded, plus GUARD_ACTOR's
// own profile as `captain` (used for the boss guard standing at the gate —
// GUARD_ACTOR guards the exit in person). getFollows' profile-view entries
// already carry avatar/displayName, so no extra getProfiles batch is needed
// just to draw a face on each rank-and-file guard; the captain needs one
// extra getProfile call for GUARD_ACTOR's own avatar.
export async function loadGuardRoster({ onStep } = {}) {
  if (onStep) onStep(`finding who @${GUARD_ACTOR} follows…`);
  const did = await resolveDid(GUARD_ACTOR);
  const [follows, captainProfile] = await Promise.all([
    allFollows(did),
    jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).catch(
      () => null,
    ),
  ]);
  const guards = follows.filter((f) => f.did !== did).map(profileOf);
  const captain = captainProfile ? profileOf(captainProfile) : null;
  return { did, handle: GUARD_ACTOR, guards, captain };
}

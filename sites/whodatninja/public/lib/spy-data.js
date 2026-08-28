// spy-data.js — turn a Bluesky handle into a "moots vs. decoys" split for the
// I-spy grid: real moots (mutuals) to find, and a separate decoy pool of
// people who AREN'T mutuals (follow-only + follower-only) so the game has
// honest distractors instead of padding the grid with more real answers.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getProfile.
// Copied and adapted from moot-bingo/public/lib/moots.js (copy, don't
// abstract) — moots.js widens its pool with plain follows when mutuals run
// short, which is exactly the thing we can't do here: a decoy that's
// secretly a real moot would make the grid unwinnable to judge fairly.

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

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

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

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (seen.has(p.did)) continue;
    seen.add(p.did);
    out.push(p);
  }
  return out;
}

// Resolve a handle into a spy round's raw material. Returns:
//   { did, handle, self, moots: [profile...], decoys: [profile...], counts }
// `moots` is the TRUE mutual set (follows ∩ followers) — no widening, since
// every one of these is a correct answer in the grid. `decoys` is everyone
// else in the handle's immediate graph (follow-only + follower-only) — real
// accounts the handle actually interacts with, just not mutuals, which makes
// for a fair "is this one a moot or not" guess instead of an obvious plant.
export async function loadSpySet(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  let self = {
    did,
    handle: actor.replace(/^@/, ""),
    displayName: actor.replace(/^@/, ""),
    avatar: "",
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
  } catch {}

  const followerDids = new Set(followers.map((f) => f.did));
  const followDids = new Set(follows.map((f) => f.did));

  const moots = dedupe(
    follows
      .filter((f) => f.did !== did && followerDids.has(f.did))
      .map(profileOf),
  );
  const followOnly = follows
    .filter((f) => f.did !== did && !followerDids.has(f.did))
    .map(profileOf);
  const followerOnly = followers
    .filter((f) => f.did !== did && !followDids.has(f.did))
    .map(profileOf);
  const decoys = dedupe(followOnly.concat(followerOnly));

  return {
    did,
    handle: self.handle,
    self,
    moots,
    decoys,
    counts: {
      follows: follows.length,
      followers: followers.length,
      moots: moots.length,
      decoys: decoys.length,
    },
  };
}

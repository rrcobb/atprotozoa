// moots.js — turn a Bluesky handle into its "moots" (mutuals) so we can fill a
// bingo tumbler with people it actually knows.
//
// moots = MUTUALS: the accounts a handle follows that also follow back
// (follows ∩ followers). A roster of mutuals makes the draw recognizable —
// you know the faces coming out of the drum. If there aren't enough mutuals to
// fill a card, we widen to plain follows so a game can still run.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getProfile.
// Copied and trimmed from neighborhood/hood.js (copy, don't abstract).

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows + ~1200 followers scanned for mutuals
const MIN_POOL = 24; // below this, widen mutuals → follows so a full card fills

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

// Resolve a handle to its moots. Returns:
//   { did, handle, self, pool: [{did,handle,displayName,avatar}], kind, counts }
// `pool` is the moots WITHOUT self (self is handed back separately for the FREE
// square). `kind` is "moots" or "moots + follows" (the widen fallback).
export async function moots(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  // self: display name / avatar for the FREE centre square ("you").
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
  const seen = new Set([did]); // never let self slip into the pool
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
    // widen: add plain follows (recognizable enough) to reach a fillable card
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "moots + follows";
  }

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
    },
  };
}

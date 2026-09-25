// moots.js — turn a Bluesky handle into its "moots" (mutuals), so we can hash
// their avatars and rank the pairs whose pfps are easiest to mix up.
//
// moots = MUTUALS: the accounts a handle follows that also follow back
// (follows ∩ followers). Trimmed from sites/moot-bingo/public/lib/moots.js
// (copy, don't abstract) — dropped the "widen to plain follows" fallback,
// since a pairing tool doesn't need a fixed pool size the way a 5×5 bingo
// card does; two real mutuals is already enough to make a pair.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getProfile.

import { followerDids as constellationFollowerDids } from "./microcosm.js";

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — same treatment as the rest of the moot-family sites (raised 2026-08-28; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)

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

// Bio + account-creation date for one mutual. getFollows only returns a
// basic profileView (handle/displayName/avatar), so this is a second fetch
// — deliberately NOT done for every mutual (that's what pushed the old
// GRAPH_PAGES cap up to 400 when it was for graph edges; bios aren't repo
// data, there's no bulk endpoint for them). Callers fetch this only for the
// handful of mutuals who end up in a displayed twin pair, to give the
// mnemonic something about the person beyond their pfp.
export async function getProfileDetails(did) {
  try {
    const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    return { description: p.description || "", createdAt: p.createdAt || null };
  } catch {
    return { description: "", createdAt: null };
  }
}

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
//   { did, handle, mutuals: [{did,handle,displayName,avatar}], counts }
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

  let handle = actor.replace(/^@/, "");
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    handle = prof.handle || handle;
  } catch {}

  const followerDids = new Set(followerIds);
  const seen = new Set([did]); // never let self slip into the pool
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  return {
    did,
    handle,
    mutuals,
    counts: {
      follows: follows.length,
      followers: followerIds.length,
      mutuals: mutuals.length,
    },
  };
}

// mutuals.js — resolve a Bluesky handle to its moots (mutuals): people it
// follows who follow it back. Reads the public AppView anonymously
// (api.bsky.app, CORS *, no auth). Copied from sites/mootrace/public/lib/mutuals.js
// (itself trimmed from clustercrawl/lib/cluster.js) — copy, don't abstract.
// Unlike cluster.js's moots(), this does NOT widen the pool to plain follows
// when the mutual count is small: the premise here is "your actual mutuals,"
// not a padded-out lookalike set. hashteams' /mutuals view calls mutualsOf()
// with the signed-in session's own DID (already resolved, so resolveDid()
// below is a no-op for it) and pairs each mutual with its team number.

import { followerDids as constellationFollowerDids } from "./microcosm.js";

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — same treatment as the rest of the moot family (see notes/40-new-site-playbook.md, 2026-08-28 cap order): getFollows/getFollowers have no bulk-download equivalent, so this still paginates, but the page count it's willing to spend is not a correctness limit.

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

// Resolve a handle to { did, handle, self, mutuals, counts }. `mutuals` is
// the plain follow ∩ follow-back set, self excluded, no widening.
export async function mutualsOf(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows them back…");
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

  const followerDids = new Set(followerIds);
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  return {
    did,
    handle: self.handle,
    self,
    mutuals,
    counts: { follows: follows.length, followers: followerIds.length, mutuals: mutuals.length },
  };
}

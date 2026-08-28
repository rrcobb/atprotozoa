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
//
// Reported false negatives (2026-08-07, @norvid-studies.bsky.social /
// @gracekind.net): large accounts (2000+ follows or followers) got real
// moots dropped into the decoy pool. Root cause — follows/followers are
// paginated and capped at GRAPH_PAGES; for an account past the cap, one side
// of the mutual check goes stale, so `followerDids.has(f.did)` (or the
// mirror check) comes back false for someone who's actually a genuine
// mutual, just fetched-out-of-range. Confirmed against the live AppView:
// norvid-studies follows 399 (fits) but has 2184 followers (didn't, at the
// old 1200 cap), and timfduffy.com — a real mutual per
// app.bsky.graph.getRelationships — fell past page 12 of that followers
// fetch and landed in decoys. Fixed two ways below: a higher page cap, plus
// a getRelationships double-check (see verifyMutuality) for whichever side
// still truncates on very large accounts, so a fetched-but-unconfirmed decoy
// gets a real per-DID answer instead of a guess from a partial list.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)
const REL_BATCH = 30; // app.bsky.graph.getRelationships "others" cap per call

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
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays
// fast. Returns whether it stopped because of that cap (cursor still had
// more) vs. because the list genuinely ended — callers use `truncated` to
// decide whether the derived moot/decoy split needs a getRelationships
// double-check.
async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  let truncated = false;
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
    if (p === GRAPH_PAGES - 1) truncated = true;
  }
  return { items: out, truncated };
}

// For a bucket of candidates whose mutuality is uncertain because the OTHER
// side of the graph got truncated (see graphAll), ask the AppView directly
// instead of guessing from a partial list: app.bsky.graph.getRelationships
// answers "does `did` follow / get followed by each of these others" per-DID
// without re-paginating anything. Batched at REL_BATCH, a few batches in
// flight at once. `wantKey` is "followedBy" (candidate follows `did` back —
// used for the follow-only bucket) or "following" (`did` follows candidate
// back — used for the follower-only bucket).
async function verifyMutuality(did, candidates, wantKey) {
  const confirmed = new Set();
  const batches = [];
  for (let i = 0; i < candidates.length; i += REL_BATCH) {
    batches.push(candidates.slice(i, i + REL_BATCH));
  }
  const CONCURRENCY = 6;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (batch) => {
        const u = new URL(`${PUB}/app.bsky.graph.getRelationships`);
        u.searchParams.set("actor", did);
        for (const c of batch) u.searchParams.append("others", c.did);
        try {
          const d = await jget(u.toString());
          return d.relationships || [];
        } catch {
          return [];
        }
      }),
    );
    for (const rels of results) {
      for (const r of rels) {
        if (r && r[wantKey]) confirmed.add(r.did);
      }
    }
  }
  return confirmed;
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
  const { items: follows, truncated: followsTruncated } = await graphAll(
    "app.bsky.graph.getFollows",
    "follows",
    did,
  );
  if (onStep) onStep("finding who follows them back…");
  const { items: followers, truncated: followersTruncated } = await graphAll(
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

  let moots = follows
    .filter((f) => f.did !== did && followerDids.has(f.did))
    .map(profileOf);
  let followOnly = follows
    .filter((f) => f.did !== did && !followerDids.has(f.did))
    .map(profileOf);
  let followerOnly = followers
    .filter((f) => f.did !== did && !followDids.has(f.did))
    .map(profileOf);

  // followOnly is only trustworthy as "not a moot" if the followers fetch
  // saw everything; same for followerOnly against a truncated follows fetch.
  // Where that's not true, ask the AppView per-DID instead of trusting the
  // partial list, and promote anyone it confirms is actually mutual.
  if (followersTruncated && followOnly.length) {
    if (onStep) onStep("double-checking who follows back…");
    const confirmed = await verifyMutuality(did, followOnly, "followedBy");
    if (confirmed.size) {
      moots = moots.concat(followOnly.filter((p) => confirmed.has(p.did)));
      followOnly = followOnly.filter((p) => !confirmed.has(p.did));
    }
  }
  if (followsTruncated && followerOnly.length) {
    if (onStep) onStep("double-checking who they follow…");
    const confirmed = await verifyMutuality(did, followerOnly, "following");
    if (confirmed.size) {
      moots = moots.concat(followerOnly.filter((p) => confirmed.has(p.did)));
      followerOnly = followerOnly.filter((p) => !confirmed.has(p.did));
    }
  }

  moots = dedupe(moots);
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

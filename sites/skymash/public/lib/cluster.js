// cluster.js — skymash's cluster-score lookup: turn a Bluesky handle/DID into
// a "cluster score" (mutual-follow pool size, widened to follows if too
// thin). Everything reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth). Copied and trimmed from simcluster-twin/public/lib/cluster.js
// (itself from grand-moot-auto/public/lib/cluster.js, mootdrone, clustercrawl,
// simcluster — copy, don't abstract), which is the same scoring shape the
// whole simcluster-* family uses: community positioning, not follower count.
//
// This started as skymash's answer to "40+ on Shimmer Math Labs' Simcluster
// framework" from the build brief — there's no single canonical numeric
// "Simcluster score" elsewhere in this repo, so skymash used the family's own
// mutual-pool-size metric as an eligibility bar. As of 2026-08-31 it's no
// longer a bar: @fromthewestmeadow.com asked to open nominations to everyone
// on the site, not just the simcluster people, so the score this module
// returns is now shown for transparency/flavor only (see app.js and the
// about page) and no longer gates anything.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — see notes/40-new-site-playbook.md history; a fixed page count on getFollows/getFollowers is a speed knob, not a correctness bound
const MIN_POOL = 4; // below this, widen mutuals → follows so the pool isn't empty

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
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
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
    for (const it of d[key] || []) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle/DID to its cluster score: mutual-follow pool size,
// widened to plain follows if the mutual set is too small to be meaningful.
// Returns { did, handle, score, kind, counts }.
export async function clusterScore(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows them back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followerDids = new Set(followers);
  const mutualCount = follows.filter((d) => d !== did && followerDids.has(d)).length;

  let score = mutualCount;
  let kind = "moots";
  if (mutualCount < MIN_POOL) {
    score = follows.length;
    if (score > mutualCount) kind = "moots + follows";
  }

  return {
    did,
    score,
    kind,
    counts: { follows: follows.length, followers: followers.length, mutuals: mutualCount },
  };
}

// Bulk list of DIDs a given account follows — used by app.js's "only match
// people I follow" vote filter, so matchups can be limited to accounts a
// signed-in voter will actually recognize. Same graphAll() bulk walk as
// clusterScore() above, just returning the raw list instead of a score.
export async function getFollowingDids(did) {
  return graphAll("app.bsky.graph.getFollows", "follows", did);
}

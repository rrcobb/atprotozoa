// moots.js — one account's moot set (mutual-follow edges: A and B are moots
// iff A follows B AND B follows A). Trimmed from sites/kevinmoot/lib/bfs.js
// down to a single-account lookup (kevinmoot needs the full BFS-across-many-
// accounts machinery to trace a chain between two people; mootfluence only
// ever needs "who are THIS one account's moots").
//
// follows and followers are read asymmetrically, same reasoning as
// kevinmoot's bfs.js:
//   - follows (who `did` follows) are app.bsky.graph.follow records living in
//     `did`'s own repo, so they're bulk-readable in one
//     com.atproto.sync.getRepo CAR download, no page cap — see car.js and
//     the "prefer bulk reads" standing order in
//     sites/buildthis/builder/INSTRUCTIONS.md. Falls back to a paginated
//     app.bsky.graph.getFollows walk only if the CAR read itself fails.
//   - followers (who follows `did`) are an AppView-computed reverse index,
//     not a repo record, so there's no bulk-download equivalent —
//     microcosm.blue's Constellation is tried first (pages of 1000 vs the
//     AppView's 100), falling back to a paginated app.bsky.graph.getFollowers
//     walk if Constellation errors.
//
// Page caps below are last-resort backstops (a truly mega-followed account
// has millions of followers), not budgets tuned for speed — see kevinmoot's
// bfs.js header and the 2026-08-28 "question every cap" standing order.

import { jget, resolvePds } from "./identity.js";
import { fetchRepoRecordsWithKeys } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const CONSTELLATION = "https://constellation.microcosm.blue";
const CONSTELLATION_PAGES = 400;
const FOLLOWERS_PAGES = 400;
const FALLBACK_FOLLOWS_PAGES = 400;

async function graphAll(endpoint, key, did, maxPages) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < maxPages; p++) {
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

async function fetchFollows(did) {
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.graph.follow");
    return records.map((r) => r.value && r.value.subject).filter(Boolean);
  } catch {
    return graphAll("app.bsky.graph.getFollows", "follows", did, FALLBACK_FOLLOWS_PAGES);
  }
}

async function fetchFollowersConstellation(did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < CONSTELLATION_PAGES; p++) {
    const u = new URL(`${CONSTELLATION}/links/distinct-dids`);
    u.searchParams.set("target", did);
    u.searchParams.set("collection", "app.bsky.graph.follow");
    u.searchParams.set("path", ".subject");
    u.searchParams.set("limit", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    const page = d.linking_dids || [];
    out.push(...page);
    cursor = d.cursor;
    if (!cursor || !page.length) break;
  }
  return out;
}

async function fetchFollowers(did) {
  try {
    return await fetchFollowersConstellation(did);
  } catch {
    return graphAll("app.bsky.graph.getFollowers", "followers", did, FOLLOWERS_PAGES);
  }
}

// The moot set (as an array of DIDs) for one account.
export async function mootsOf(did, onStep) {
  if (onStep) onStep("reading who you follow…");
  const followsP = fetchFollows(did);
  if (onStep) onStep("reading who follows you back…");
  const followersP = fetchFollowers(did);
  const [follows, followers] = await Promise.all([followsP, followersP]);
  const followerSet = new Set(followers);
  return follows.filter((d) => d !== did && followerSet.has(d));
}

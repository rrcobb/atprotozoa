// bfs.js — bidirectional breadth-first search across the "moot" network
// (mutual-follow edges: A and B are moots iff A follows B AND B follows A).
//
// A global follow graph doesn't exist anywhere to query directly, so the
// graph is discovered live, per-account, as BFS visits it. The two halves of
// a moot check are NOT symmetric in how completely they can be read:
//
//   - follows (who `did` follows) are `app.bsky.graph.follow` records that
//     live in `did`'s OWN repo, so they're bulk-readable: one
//     com.atproto.sync.getRepo CAR download recovers every follow that
//     account has ever written, no page cap, full stop (see car.js and
//     notes/40-new-site-playbook.md's cee.wtf thread, 2026-08-25 — prefer a
//     repo download over a paginated listRecords/getFollows walk whenever
//     "give me all of X" is the ask). This is the fetchFollows() path below,
//     falling back to paginated getFollows only if the CAR read itself fails
//     (oversized repo, PDS unreachable/non-CORS, malformed CAR).
//   - followers (who follows `did`) are an AppView-computed reverse index,
//     not a record in anyone's repo — there's no bulk endpoint for "everyone
//     who follows me," so app.bsky.graph.getFollowers has to stay paginated.
//     FOLLOWERS_PAGES bounds that walk for genuine safety (a mega-followed
//     account could otherwise be tens of thousands of sequential requests
//     for one BFS node) rather than out of habitual caution — it's set high
//     enough that it won't quietly truncate an ordinary account's followers.
//
// Even with follows fully read, BFS still needs to bound its own breadth:
// computing one account's moot set is two network reads, and BFS needs it
// for every account on the frontier, which multiplies fast. So this is
// capped on two axes: accounts expanded per round (FRONTIER_CAP) and total
// accounts expanded across the whole search (default accountBudget) — real
// search-breadth/time limits, not per-account data truncation. Bidirectional
// search (grow the smaller of the two frontiers each round, stop the instant
// the frontiers touch) keeps the typical case — most reachable pairs are 2-4
// moots apart — cheap; the caps exist for the pairs that aren't close, so a
// bad query degrades to "couldn't find a path in budget" instead of hanging
// the tab.

import { jget, pooledEach, resolvePds } from "./identity.js";
import { fetchRepoRecordsWithKeys } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const FOLLOWERS_PAGES = 50; // <= ~5000 followers scanned per account — no bulk read exists for this side, see header
const FALLBACK_FOLLOWS_PAGES = 50; // paginated fallback, only used if the CAR read fails
const FETCH_CONCURRENCY = 6;
const FRONTIER_CAP = 45; // accounts expanded per round, per side
const DEFAULT_ACCOUNT_BUDGET = 220; // total accounts whose moot set gets computed
const DEFAULT_MAX_ROUNDS = 10;

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

// Every DID `did` follows, read straight from their own repo (one CAR
// download, no page cap) so a heavily-followed account's follow list never
// gets silently truncated. Falls back to a paginated getFollows walk if the
// repo download itself fails.
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

function fetchFollowers(did) {
  return graphAll("app.bsky.graph.getFollowers", "followers", did, FOLLOWERS_PAGES);
}

// did -> Promise<Set<did>>, shared across a single search so a account that
// shows up from both sides (or gets re-touched) is only ever fetched once.
function makeMootFetcher() {
  const cache = new Map();
  return function mootsOf(did) {
    if (cache.has(did)) return cache.get(did);
    const p = (async () => {
      const [follows, followers] = await Promise.all([fetchFollows(did), fetchFollowers(did)]);
      const followerSet = new Set(followers);
      return new Set(follows.filter((d) => d !== did && followerSet.has(d)));
    })();
    cache.set(did, p);
    return p;
  };
}

// Walk a parent map from `node` back up to its root (whose parent is null),
// returning [node, parent(node), grandparent(node), ..., root].
function walkUp(parentMap, node) {
  const chain = [node];
  let cur = parentMap.get(node);
  while (cur !== null && cur !== undefined) {
    chain.push(cur);
    cur = parentMap.get(cur);
  }
  return chain;
}

/**
 * Find the shortest moot-chain between two DIDs. Returns
 *   { degrees, path } — path is [startDid, ..., targetDid], degrees === path.length - 1
 * or, if no chain was found within budget,
 *   { degrees: null, path: null, reason: "budget" | "maxrounds" | "deadend", accountsChecked }
 */
export async function findMootPath(startDid, targetDid, opts = {}) {
  const {
    onStep,
    accountBudget = DEFAULT_ACCOUNT_BUDGET,
    maxRounds = DEFAULT_MAX_ROUNDS,
    frontierCap = FRONTIER_CAP,
  } = opts;

  if (startDid === targetDid) return { degrees: 0, path: [startDid] };

  const mootsOf = makeMootFetcher();
  const parentA = new Map([[startDid, null]]);
  const parentB = new Map([[targetDid, null]]);
  let frontierA = [startDid];
  let frontierB = [targetDid];
  let accountsChecked = 0;

  function buildResult(meet) {
    const left = walkUp(parentA, meet).reverse(); // start -> ... -> meet
    const right = walkUp(parentB, meet).slice(1); // meet's parent-on-B-side -> ... -> target
    const path = left.concat(right);
    return { degrees: path.length - 1, path };
  }

  async function expand(frontier, mine, theirs) {
    const batch = frontier.slice(0, frontierCap);
    const dropped = frontier.length - batch.length;
    const next = [];
    let meet = null;
    await pooledEach(batch, FETCH_CONCURRENCY, async (did) => {
      if (meet || accountsChecked >= accountBudget) return;
      accountsChecked++;
      let moots;
      try {
        moots = await mootsOf(did);
      } catch {
        moots = new Set();
      }
      for (const m of moots) {
        if (mine.has(m)) continue;
        mine.set(m, did);
        next.push(m);
        if (!meet && theirs.has(m)) meet = m;
      }
    });
    return { next, meet, dropped };
  }

  for (let round = 1; round <= maxRounds; round++) {
    if (accountsChecked >= accountBudget) {
      return { degrees: null, path: null, reason: "budget", accountsChecked };
    }
    if (!frontierA.length && !frontierB.length) {
      return { degrees: null, path: null, reason: "deadend", accountsChecked };
    }
    const sideA = frontierA.length > 0 && (frontierB.length === 0 || frontierA.length <= frontierB.length);
    const frontier = sideA ? frontierA : frontierB;
    const mine = sideA ? parentA : parentB;
    const theirs = sideA ? parentB : parentA;

    if (onStep) {
      onStep({
        round,
        side: sideA ? "a" : "b",
        expanding: Math.min(frontier.length, frontierCap),
        accountsChecked,
      });
    }

    const { next, meet, dropped } = await expand(frontier, mine, theirs);
    if (dropped > 0 && onStep) {
      onStep({ round, side: sideA ? "a" : "b", note: `capped: skipped ${dropped} accounts this round` });
    }
    if (meet) return buildResult(meet);
    if (sideA) frontierA = next;
    else frontierB = next;
  }

  return { degrees: null, path: null, reason: "maxrounds", accountsChecked };
}

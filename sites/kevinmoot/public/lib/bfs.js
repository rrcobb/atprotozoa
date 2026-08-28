// bfs.js — bidirectional breadth-first search across the "moot" network
// (mutual-follow edges: A and B are moots iff A follows B AND B follows A).
//
// A global follow graph doesn't exist anywhere to query directly, so the
// graph is discovered live: computing one account's moot set costs two
// paginated public-AppView reads (their follows, their followers — see
// identity.js's jget/pooledEach, copied from metamoots). That's cheap for a
// single account (metamoots does it for the search root) but BFS needs it for
// every account on the frontier, which multiplies fast, so this is capped
// hard on three axes: pages scanned per account (GRAPH_PAGES), accounts
// expanded per round (FRONTIER_CAP), and total accounts expanded across the
// whole search (default accountBudget). Bidirectional search (grow the
// smaller of the two frontiers each round, stop the instant the frontiers
// touch) keeps the typical case — most reachable pairs are 2-4 moots apart —
// cheap; the caps exist for the pairs that aren't close, so a bad query
// degrades to "couldn't find a path in budget" instead of hanging the tab.

import { jget, pooledEach } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGES = 5; // <= ~500 follows / ~500 followers scanned per account
const FETCH_CONCURRENCY = 6;
const FRONTIER_CAP = 45; // accounts expanded per round, per side
const DEFAULT_ACCOUNT_BUDGET = 220; // total accounts whose moot set gets computed
const DEFAULT_MAX_ROUNDS = 10;

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

// did -> Promise<Set<did>>, shared across a single search so a account that
// shows up from both sides (or gets re-touched) is only ever fetched once.
function makeMootFetcher() {
  const cache = new Map();
  return function mootsOf(did) {
    if (cache.has(did)) return cache.get(did);
    const p = (async () => {
      const [follows, followers] = await Promise.all([
        graphAll("app.bsky.graph.getFollows", "follows", did),
        graphAll("app.bsky.graph.getFollowers", "followers", did),
      ]);
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

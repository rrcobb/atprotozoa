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
//     FOLLOWERS_PAGES bounds that walk. Raised 2026-08-28 (bisks.net, same
//     thread as the CAR fix): a page cap is exactly the kind of "mess up
//     correctness for speed" tradeoff the 2026-08-25 bulk-reads order was
//     written to kill, and letting a search run slow beats letting it be
//     wrong. It still has to stop *somewhere* short of literal infinity (a
//     true mega-followed account has millions of followers, which is a
//     different problem than "we didn't want to wait"), so the number below
//     is a last-resort backstop, not a budget.
//
// Even with follows fully read, BFS still needs to bound its own breadth:
// computing one account's moot set is two network reads, and BFS needs it
// for every account on the frontier, which multiplies fast. This is capped
// on two axes: accounts expanded per round (FRONTIER_CAP) and total accounts
// expanded across the whole search (default accountBudget). Both were raised
// 2026-08-28 for the same reason as FOLLOWERS_PAGES — these bound how long a
// tab is willing to sit there, not how correct the answer is, so they should
// be as generous as "still eventually finishes" allows rather than tuned for
// snappiness. Bidirectional search (grow the smaller of the two frontiers
// each round, stop the instant the frontiers touch) keeps the typical case —
// most reachable pairs are 2-4 moots apart — cheap regardless; the caps only
// bite for pairs that are genuinely far apart or disconnected, where a bad
// query now degrades to "searched a lot longer, still didn't find it"
// instead of hanging the tab forever.

import { jget, pooledEach, resolvePds } from "./identity.js";
import { fetchRepoRecordsWithKeys } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const FOLLOWERS_PAGES = 400; // <= ~40,000 followers scanned per account — backstop, not a budget; see header
const FALLBACK_FOLLOWS_PAGES = 400; // paginated fallback, only used if the CAR read fails
const FETCH_CONCURRENCY = 6;
const FRONTIER_CAP = 150; // accounts expanded per round, per side
const DEFAULT_ACCOUNT_BUDGET = 1500; // total accounts whose moot set gets computed
const DEFAULT_MAX_ROUNDS = 18;

// Persistent cross-search moot-set cache -----------------------------------
//
// makeMootFetcher()'s in-memory Map only lives for one findMootPath() call,
// so retracing the same pair — or a different pair whose search frontiers
// happen to overlap (common: popular accounts show up in lots of chains) —
// redid two full network reads per account every time. A moot set is the
// expensive-to-compute, cheap-to-store *output* of that work (a short array
// of DIDs, versus the full follows+followers used to derive it), so it's
// what's worth persisting across page loads: localStorage, namespaced per
// DID.
//
// TTL is 6 hours: a follow/unfollow shouldn't stay invisible for days, but
// most retraces (someone swaps A/B, a thread has two people tracing
// overlapping accounts within the same sitting) happen within minutes and
// should be instant. This is a freshness choice with a stated reason, not a
// size/count cap — see notes/40-new-site-playbook.md's cee.wtf thread,
// 2026-08-28, on caps needing to justify themselves.
const CACHE_PREFIX = "kevinmoot:moots:v1:";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function readCachedMoots(did) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + did);
    if (!raw) return null;
    const { ts, m } = JSON.parse(raw);
    if (!Array.isArray(m) || Date.now() - ts > CACHE_TTL_MS) return null;
    return m;
  } catch {
    return null;
  }
}

// Drop expired entries so a full localStorage (quota is a real per-origin
// browser limit, unlike the page caps above) has somewhere to make room
// before caching is simply skipped.
function pruneExpiredCache() {
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      try {
        const { ts } = JSON.parse(localStorage.getItem(k));
        if (Date.now() - ts > CACHE_TTL_MS) stale.push(k);
      } catch {
        stale.push(k);
      }
    }
    for (const k of stale) localStorage.removeItem(k);
  } catch {
    // localStorage unavailable — nothing to prune
  }
}

function writeCachedMoots(did, moots) {
  const key = CACHE_PREFIX + did;
  const payload = JSON.stringify({ ts: Date.now(), m: moots });
  try {
    localStorage.setItem(key, payload);
  } catch {
    pruneExpiredCache();
    try {
      localStorage.setItem(key, payload);
    } catch {
      // still full (or storage disabled, e.g. private browsing) — caching
      // is an optimization, not a requirement, so just skip this entry
    }
  }
}

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
// Backed by the persistent localStorage cache above, so accounts already
// resolved in a *previous* search (or an earlier round of this one, across
// page loads) skip the network entirely.
function makeMootFetcher() {
  const cache = new Map();
  return function mootsOf(did) {
    if (cache.has(did)) return cache.get(did);
    const cached = readCachedMoots(did);
    if (cached) {
      const p = Promise.resolve(new Set(cached));
      cache.set(did, p);
      return p;
    }
    const p = (async () => {
      const [follows, followers] = await Promise.all([fetchFollows(did), fetchFollowers(did)]);
      const followerSet = new Set(followers);
      const moots = follows.filter((d) => d !== did && followerSet.has(d));
      writeCachedMoots(did, moots);
      return new Set(moots);
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

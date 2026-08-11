// network.js — second-degree oomfs (oomfs-of-oomfs), built on top of
// moots.js's first-degree oomf finder (oomfs = mutuals = follows ∩
// followers, this repo's standing convention — see moots.js). Reads
// Bluesky's public AppView anonymously, same as moots.js.
//
// A full second-degree crawl (every oomf's full follows+followers, every
// page) is expensive — could be thousands of calls for a well-connected
// account. Instead this samples a bounded number of your oomfs and reads a
// bounded number of pages of each one's graph, which is plenty to give
// "current discourse" a real second-degree signal without hanging the page
// for a minute. Copy of the graphAll() pagination pattern in moots.js,
// capped tighter (copy, don't abstract — see notes/10-architecture.md).

const PUB = "https://public.api.bsky.app/xrpc";

const OOMF_SAMPLE = 16; // how many of your oomfs get crawled for their own oomfs
const GRAPH_PAGES_2 = 3; // ≤ ~300 follows + ~300 followers per sampled oomf
const CONCURRENCY = 6;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function graphPage(endpoint, did, limit, cursor) {
  const u = new URL(`${PUB}/${endpoint}`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", String(limit));
  if (cursor) u.searchParams.set("cursor", cursor);
  return jget(u.toString());
}

async function graphAllCapped(endpoint, key, did, pages) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < pages; p++) {
    let d;
    try {
      d = await graphPage(endpoint, did, 100, cursor);
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// One oomf's own mutuals (their follows ∩ their followers).
async function oomfsOf(did) {
  const [follows, followers] = await Promise.all([
    graphAllCapped("app.bsky.graph.getFollows", "follows", did, GRAPH_PAGES_2),
    graphAllCapped("app.bsky.graph.getFollowers", "followers", did, GRAPH_PAGES_2),
  ]);
  const followerDids = new Set(followers.map((f) => f.did));
  return follows.filter((f) => followerDids.has(f.did)).map((f) => f.did);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Given your (did, oomf pool from moots.js), sample a subset of oomfs and
// union their own oomf sets — that's oomfs-of-oomfs. Excludes you and your
// direct oomfs. Returns a plain Set<did>.
export async function secondDegree(did, oomfPool, { onStep } = {}) {
  const sample = oomfPool.slice(0, OOMF_SAMPLE);
  const excluded = new Set([did, ...oomfPool.map((p) => p.did)]);
  const oomfs2 = new Set();

  let done = 0;
  await mapLimit(sample, CONCURRENCY, async (oomf) => {
    const theirs = await oomfsOf(oomf.did);
    for (const d of theirs) {
      if (!excluded.has(d)) oomfs2.add(d);
    }
    done++;
    if (onStep) onStep(`reading your oomfs' oomfs… (${done}/${sample.length})`);
  });

  return oomfs2;
}

// moots.js — find a user's mutuals, then read every block record each mutual
// has published and tally who is blocked by how many of them.
//
// Mutuals = follows ∩ followers. Follows come from the AppView's getFollows;
// followers come from Constellation's backlink index (microcosm.js drop-in)
// with the AppView's getFollowers as the fallback. Blocks are public records
// (app.bsky.graph.block) in each mutual's own repo, so they're read straight
// off that mutual's PDS with listRecords on the one collection — a CAR
// download would pull the whole repo just to read one small collection.
// Every walk pages to exhaustion.
import { jget, resolveDidDoc, pooledEach } from "./identity.js";
import { followerDids } from "./microcosm.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const GRAPH_PAGES = 400; // runaway backstop (40,000 at 100/page), not a budget
const BLOCK_PAGES = 500; // runaway backstop (50,000 blocks at 100/page) for a single mutual, not a budget
const CONCURRENCY = 8; // simultaneous PDS reads — keeps the browser's connection pool and small PDSes happy

async function graphAll(method, key, actor, onStep) {
  const out = [];
  let cursor = "";
  for (let i = 0; i < GRAPH_PAGES; i++) {
    const u = `${APPVIEW}/${method}?actor=${encodeURIComponent(actor)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const d = await jget(u);
    const batch = d[key] || [];
    for (const p of batch) out.push(p.did);
    if (onStep) onStep(out.length);
    cursor = d.cursor;
    if (!cursor || !batch.length) break;
  }
  return out;
}

export async function findMoots(did, onStep) {
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did, (n) => onStep && onStep("follows", n));
  let followers;
  try {
    followers = await followerDids(did, { onStep: (n) => onStep && onStep("followers", n) });
  } catch {
    followers = await graphAll("app.bsky.graph.getFollowers", "followers", did, (n) => onStep && onStep("followers", n));
  }
  const fs = new Set(followers);
  return [...new Set(follows)].filter((d) => fs.has(d) && d !== did);
}

// Every block subject DID published by `did`, or throws if their repo can't be read.
export async function blocksOf(did) {
  const pds = (await resolveDidDoc(did)).pds;
  if (!pds) throw new Error("no PDS");
  const base = pds.replace(/\/$/, "");
  const out = [];
  let cursor = "";
  for (let i = 0; i < BLOCK_PAGES; i++) {
    const u = `${base}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=app.bsky.graph.block&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const d = await jget(u);
    const batch = d.records || [];
    for (const r of batch) if (r.value && typeof r.value.subject === "string") out.push(r.value.subject);
    cursor = d.cursor;
    if (!cursor || !batch.length) break;
  }
  return out;
}

// Reads every mutual's blocks. Returns { blockers: Map<blockedDid, Set<mootDid>>, failed: [mootDid] }.
export async function tallyBlocks(moots, onProgress) {
  const blockers = new Map();
  const failed = [];
  let done = 0;
  await pooledEach(moots, CONCURRENCY, async (m) => {
    try {
      for (const b of await blocksOf(m)) {
        if (b === m) continue;
        let s = blockers.get(b);
        if (!s) blockers.set(b, (s = new Set()));
        s.add(m);
      }
    } catch {
      failed.push(m);
    }
    done++;
    if (onProgress) onProgress(done, moots.length);
  });
  return { blockers, failed };
}

// Ranked [{ did, count }] of accounts blocked by at least `min` mutuals, most first.
export function rank(blockers, min, exclude = new Set()) {
  const rows = [];
  for (const [did, s] of blockers) if (s.size >= min && !exclude.has(did)) rows.push({ did, count: s.size });
  rows.sort((a, b) => b.count - a.count || (a.did < b.did ? -1 : 1));
  return rows;
}

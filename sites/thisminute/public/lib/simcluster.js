// simcluster.js — the DID set for "@bisks.net's simcluster": bisks.net's
// moots (mutuals — follows ∩ followers). "Simcluster" is this project's word
// for the mutuals graph around an account; see notes/ideas or clusterpedia's
// self-referential "Simcluster" article for the full writeup. Trimmed from
// sites/simcluster/public/lib/moots.js, anchored to one fixed DID instead of
// an arbitrary handle (copy, don't abstract).
//
// Reads Bluesky's PUBLIC AppView anonymously (api.bsky.app, CORS *, no auth).

const PUB = "https://api.bsky.app/xrpc";
const ANCHOR_DID = "did:plc:f6n22z62adionrvb5s6n6vfk"; // bisks.net (Rob)
const GRAPH_PAGES = 12; // ≤ ~1200 follows + ~1200 followers scanned

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function graphAllDids(endpoint, key) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", ANCHOR_DID);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) if (it?.did) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolves to { dids: Set<string>, count: number } — bisks.net's moots,
// ANCHOR_DID itself included so a post from bisks.net counts too.
export async function loadSimcluster({ onStep } = {}) {
  if (onStep) onStep("finding who @bisks.net follows…");
  const follows = await graphAllDids("app.bsky.graph.getFollows", "follows");
  if (onStep) onStep("finding who follows @bisks.net back…");
  const followers = await graphAllDids("app.bsky.graph.getFollowers", "followers");

  const followerSet = new Set(followers);
  const dids = new Set([ANCHOR_DID]);
  for (const f of follows) if (followerSet.has(f)) dids.add(f);

  return { dids, count: dids.size };
}

// pool.js — resolve a handle to itself + its moots (mutuals: accounts it
// follows that also follow it back). Public AppView only, no auth. Copied
// and trimmed from sites/cloutgraph/public/lib/pool.js (mutuals half only —
// this site has no list mode).

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows + ~1200 followers scanned
export const MAX_POOL = 24; // keep the downstream per-account post-history scan bounded

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

// Batch-fetch full profiles (followersCount, createdAt, avatar, ...) —
// app.bsky.actor.getProfiles takes up to 25 actors per call.
export async function getProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const chunk = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of chunk) u.searchParams.append("actors", d);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      continue;
    }
    for (const p of d.profiles || []) out.set(p.did, p);
  }
  return out;
}

// Resolve `actor` to { subjectDid, moots, totalFound, truncated }. `moots`
// is capped at MAX_POOL, prioritizing whoever getFollows/getFollowers
// returned first (roughly follow order, not any activity signal).
export async function resolveMoots(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followerSet = new Set(followers);
  const seen = new Set([did]);
  const mootDids = [];
  for (const f of follows) {
    if (!followerSet.has(f) || seen.has(f)) continue;
    seen.add(f);
    mootDids.push(f);
  }

  const totalFound = mootDids.length;
  const capped = mootDids.slice(0, MAX_POOL);

  return {
    subjectDid: did,
    mootDids: capped,
    totalFound,
    truncated: totalFound > capped.length,
  };
}

// identity.js — handle resolution, PDS lookup, and the follows/followers
// graph mootflow classifies every interaction against. Stitched together
// from sites/mootgrinder/public/lib/moots.js (resolveDid + graphAll) and
// sites/backscroll/public/lib/identity.js (resolvePds) — copy, don't
// abstract, per house style.
//
// getFollows/getFollowers aren't repo-backed, so there's no bulk CAR
// download equivalent for them (see notes/40-new-site-playbook.md's standing
// order on bulk reads) — pagination here is the correct approach, not a
// habitual-caution leftover.
//
// GRAPH_PAGE_CAP below *is* a genuine safety bound, not habitual caution:
// riziles.bsky.social reported (2026-08-27) that mootflow fails on large
// accounts. An account with a few hundred thousand follows/followers turns
// this into thousands of sequential requests, which can hang the tab for
// minutes and balloon memory building the Sets. classify() only needs set
// membership, so a large-but-capped sample still classifies the overwhelming
// majority of interactions correctly — only accounts that actually hit the
// cap get an approximate note (see followTruncated/followerTruncated below).

const PUB = "https://public.api.bsky.app/xrpc";
const GRAPH_PAGE_CAP = 300; // ~30k follows/followers per side before capping

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
// formats — copied from mootgrinder/moots.js resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function getProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

// did.startsWith("did:web:") isn't handled here — mootflow only needs the
// PDS for a single account's own repo, and did:plc covers the overwhelming
// majority of real accounts. did:web resolution is in backscroll's identity.js
// if this ever needs to widen.
const pdsCache = new Map();
export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let endpoint = null;
  try {
    const doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
    const svc = (doc.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    endpoint = (svc && svc.serviceEndpoint) || null;
  } catch (_) {
    endpoint = null;
  }
  pdsCache.set(did, endpoint);
  return endpoint;
}

async function graphAll(endpoint, key, did, onPage) {
  const out = [];
  let cursor = "";
  let truncated = false;
  for (let page = 0; page < GRAPH_PAGE_CAP; page++) {
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
    if (onPage) onPage(out.length);
    cursor = d.cursor;
    if (!cursor) break;
    if (page === GRAPH_PAGE_CAP - 1) truncated = true;
  }
  return { items: out, truncated };
}

// Full follow graph for `did`: everyone they follow and everyone who follows
// them, as DID sets — the raw material for classifying any third DID as
// mutual / follower-only / following-only / stranger. followTruncated /
// followerTruncated are only ever true for accounts big enough to hit
// GRAPH_PAGE_CAP — the common case is a complete graph.
export async function followGraph(did, { onStep } = {}) {
  if (onStep) onStep("mapping who you follow...");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did, (n) =>
    onStep && onStep(`mapping who you follow... ${n}`),
  );
  if (onStep) onStep("mapping who follows you back...");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did, (n) =>
    onStep && onStep(`mapping who follows you back... ${n}`),
  );
  return {
    followSet: new Set(follows.items.map((f) => f.did)),
    followerSet: new Set(followers.items.map((f) => f.did)),
    followCount: follows.items.length,
    followerCount: followers.items.length,
    followTruncated: follows.truncated,
    followerTruncated: followers.truncated,
  };
}

export function classify(targetDid, { followSet, followerSet }) {
  const iFollow = followSet.has(targetDid);
  const followsMe = followerSet.has(targetDid);
  if (iFollow && followsMe) return "mutual";
  if (followsMe) return "follower";
  if (iFollow) return "following";
  return "stranger";
}

// Batched app.bsky.actor.getProfiles — up to 25 actors per call, the
// AppView's cap. Used sparingly (a top-engagers leaderboard), not for every
// DID in a flow.
export async function profilesFor(dids) {
  const uniq = [...new Set(dids)];
  const out = new Map();
  for (let i = 0; i < uniq.length; i += 25) {
    const batch = uniq.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, p);
    } catch (_) {
      // best-effort — a missing profile just falls back to a bare DID label
    }
  }
  return out;
}

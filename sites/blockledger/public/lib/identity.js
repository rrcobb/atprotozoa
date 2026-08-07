// identity.js — resolve a handle to a DID, find their true mutuals (follows ∩
// followers), batch-fetch profiles, and resolve each mutual's own PDS so
// their repo can be read directly. Everything here reads Bluesky's PUBLIC
// AppView anonymously (api.bsky.app, CORS *, no auth) plus public DID
// documents (plc.directory / did:web well-known) and public PDS repos. Copied
// and merged from mootspy/lib/spy-data.js (the truncation-safe mutual check)
// and metamoots/lib/identity.js (resolvePds, getProfiles, pooledEach) — copy,
// don't abstract.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 25; // <= ~2500 follows + ~2500 followers scanned per side
const REL_BATCH = 30; // app.bsky.graph.getRelationships "others" cap per call

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

export const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return profileOf(p);
}

// Batch-fetch profiles, 25 actors per request (AppView's cap).
export async function getProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — missing profiles just render as bare DIDs
    }
  }
  return out;
}

// Page through a graph endpoint (getFollows / getFollowers), collecting the
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays fast.
// `truncated` tells the caller whether it stopped because of that cap (more
// pages existed) vs. the list genuinely ending, so a mutual check can decide
// whether it needs a getRelationships double-check instead of trusting a
// partial list.
async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  let truncated = false;
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
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
    if (p === GRAPH_PAGES - 1) truncated = true;
  }
  return { items: out, truncated };
}

// For candidates whose mutuality is uncertain because the OTHER side of the
// graph got truncated, ask the AppView directly instead of guessing from a
// partial list: app.bsky.graph.getRelationships answers "does `did` follow /
// get followed by each of these others" per-DID without re-paginating.
async function verifyMutuality(did, candidates, wantKey) {
  const confirmed = new Set();
  const batches = [];
  for (let i = 0; i < candidates.length; i += REL_BATCH) {
    batches.push(candidates.slice(i, i + REL_BATCH));
  }
  const CONCURRENCY = 6;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (batch) => {
        const u = new URL(`${PUB}/app.bsky.graph.getRelationships`);
        u.searchParams.set("actor", did);
        for (const c of batch) u.searchParams.append("others", c.did);
        try {
          const d = await jget(u.toString());
          return d.relationships || [];
        } catch {
          return [];
        }
      }),
    );
    for (const rels of results) {
      for (const r of rels) {
        if (r && r[wantKey]) confirmed.add(r.did);
      }
    }
  }
  return confirmed;
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (seen.has(p.did)) continue;
    seen.add(p.did);
    out.push(p);
  }
  return out;
}

// Find `did`'s true mutuals (follows ∩ followers) — no widening; every result
// is a genuine two-way follow. See spy-data.js's loadSpySet for the
// truncation story this is copied from: for a large account, one side of the
// follows/followers fetch can run past GRAPH_PAGES, silently dropping a real
// mutual into "not a mutual" unless the truncated side gets a per-DID
// getRelationships double-check.
export async function findMutuals(did, { onStep } = {}) {
  if (onStep) onStep("finding who they follow…");
  const { items: follows, truncated: followsTruncated } = await graphAll(
    "app.bsky.graph.getFollows",
    "follows",
    did,
  );
  if (onStep) onStep("finding who follows them back…");
  const { items: followers, truncated: followersTruncated } = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  const followerDids = new Set(followers.map((f) => f.did));
  const followDids = new Set(follows.map((f) => f.did));

  let mutuals = follows
    .filter((f) => f.did !== did && followerDids.has(f.did))
    .map(profileOf);
  let followOnly = follows
    .filter((f) => f.did !== did && !followerDids.has(f.did))
    .map(profileOf);
  let followerOnly = followers
    .filter((f) => f.did !== did && !followDids.has(f.did))
    .map(profileOf);

  if (followersTruncated && followOnly.length) {
    if (onStep) onStep("double-checking who follows back…");
    const confirmed = await verifyMutuality(did, followOnly, "followedBy");
    if (confirmed.size) mutuals = mutuals.concat(followOnly.filter((p) => confirmed.has(p.did)));
  }
  if (followsTruncated && followerOnly.length) {
    if (onStep) onStep("double-checking who they follow…");
    const confirmed = await verifyMutuality(did, followerOnly, "following");
    if (confirmed.size) mutuals = mutuals.concat(followerOnly.filter((p) => confirmed.has(p.did)));
  }

  return {
    mutuals: dedupe(mutuals),
    counts: { follows: follows.length, followers: followers.length },
  };
}

const pdsCache = new Map(); // did -> serviceEndpoint | null

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let endpoint = null;
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await jget(`https://${host}/.well-known/did.json`);
    } else {
      doc = await jget(`https://plc.directory/${encodeURIComponent(did)}`);
    }
    const svc = (doc.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    endpoint = (svc && svc.serviceEndpoint) || null;
  } catch {
    endpoint = null;
  }
  pdsCache.set(did, endpoint);
  return endpoint;
}

// Run `fn` over `items` with at most `limit` in flight at once.
export async function pooledEach(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
}

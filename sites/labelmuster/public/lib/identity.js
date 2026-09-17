// identity.js — resolve a handle to a DID, fetch a profile with its labels
// (self-applied and moderation labels both come back on the same
// app.bsky.actor.getProfile/.getProfiles response — no auth, no
// labeler-specific plumbing needed; confirmed live against
// public.api.bsky.app: a self-applied label has `src === subject did`, a
// moderation label has `src` pointing at the labeler's own did instead), and
// walk an account's full follows+followers as the candidate pool to search
// for label-mates. Merged from sites/kevinmoot's identity.js
// (graphAll/resolveDid) and sites/blocksweep's identity.js
// (getProfilesBatch/pooledEach) — copy, don't abstract.

const PUB = "https://public.api.bsky.app/xrpc";

// Backstop, not a budget — same treatment as the rest of the moot-family
// sites (see kevinmoot's identity.js): a fixed page count on
// getFollows/getFollowers is a speed knob, not a correctness bound, so it's
// set high rather than tight.
const GRAPH_PAGES = 400;

export async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving about paste formats: @handle, bsky.app profile URL, at:// URI, DID.
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

function profileOf(p) {
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || "",
    avatar: p.avatar || "",
    labels: p.labels || [],
  };
}

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return profileOf(p);
}

// One request per 25 actors instead of one per actor. Unknown/unresolvable
// DIDs are silently omitted from the AppView's response rather than erroring
// the whole batch, so the caller just won't find them in the returned map.
export async function getProfilesBatch(dids, onProgress) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < dids.length; i += 25) chunks.push(dids.slice(i, i + 25));
  let done = 0;
  await pooledEach(chunks, 4, async (chunk) => {
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of chunk) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — a chunk that fails just leaves those accounts out
    }
    done++;
    if (onProgress) onProgress(done, chunks.length);
  });
  return out;
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

// Everyone the account follows or is followed by — the candidate pool to
// search for label-mates. There's no network-wide reverse index of "every
// account with label X" anywhere in atproto (Constellation and Cerulea both
// index at:// reference links, not scalar profile-record fields), so the
// honest, buildable version of "find everyone with this label" is scoped to
// an account's own social graph rather than the whole network.
export async function socialPool(did, onStep) {
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);
  const seen = new Set([did]);
  const pool = [];
  for (const d of [...follows, ...followers]) {
    if (!seen.has(d)) {
      seen.add(d);
      pool.push(d);
    }
  }
  return pool;
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

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
//
// A plain getProfile call only surfaces self-applied labels and Bluesky's
// own moderation service — every other labeler's opinion is gated behind the
// `atproto-accept-labelers` request header (the AppView's per-request stand-in
// for a signed-in user's labeler subscriptions), capped at 20 labeler DIDs per
// call. To see everything a labeler *anywhere* has said about an account, you
// have to know every labeler's DID and ask in batches — see
// getProfileAllLabels below, same technique as mackuba.eu's label-scanner
// (tangled.org/mackuba.eu/label-scanner), which is also where the DID roster
// itself comes from: atproto has no endpoint that enumerates "every labeler
// in existence," so this leans on that tool's community-maintained directory
// rather than us shipping and re-curating our own static snapshot.

const PUB = "https://public.api.bsky.app/xrpc";
const LABELLERS_URL = "https://blue.mackuba.eu/xrpc/blue.feeds.mod.getLabellers";
const LABEL_BATCH = 20; // the AppView's own atproto-accept-labelers header limit, not our choice
// Concurrency for the labeler-scan burst — a courtesy to a public API we
// don't run, not a coverage cap: every batch still runs, just not all at once.
const LABEL_SCAN_CONCURRENCY = 6;

// Backstop, not a budget — same treatment as the rest of the moot-family
// sites (see kevinmoot's identity.js): a fixed page count on
// getFollows/getFollowers is a speed knob, not a correctness bound, so it's
// set high rather than tight.
const GRAPH_PAGES = 400;

export async function jget(url, headers) {
  const r = await fetch(url, headers ? { headers } : undefined);
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
// `labelerDid`, when given, adds an atproto-accept-labelers header so a
// single non-default labeler's opinion is visible on every profile in the
// batch too — used when mustering a label that came from a third-party
// labeler rather than a self-applied one.
export async function getProfilesBatch(dids, onProgress, labelerDid) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < dids.length; i += 25) chunks.push(dids.slice(i, i + 25));
  const headers = labelerDid ? { "atproto-accept-labelers": labelerDid } : undefined;
  let done = 0;
  await pooledEach(chunks, 4, async (chunk) => {
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of chunk) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString(), headers);
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — a chunk that fails just leaves those accounts out
    }
    done++;
    if (onProgress) onProgress(done, chunks.length);
  });
  return out;
}

let labellersPromise = null;

// The full labeler roster (did/name/handle), fetched once per page load and
// cached — mackuba.eu's label-scanner directory (see the file header above).
// Resolves to [] on any fetch failure so a scan still works with just
// self-applied + Bluesky's default-moderation labels rather than erroring out.
export async function loadAllLabelers() {
  if (!labellersPromise) {
    labellersPromise = jget(LABELLERS_URL)
      .then((d) => d.labellers || [])
      .catch(() => []);
  }
  return labellersPromise;
}

function mergeLabels(target, labels) {
  const seen = new Set(target.map((l) => l.val + "|" + l.src));
  for (const l of labels || []) {
    const key = l.val + "|" + l.src;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(l);
  }
}

// Scan a profile's labels against every known labeler, not just the default
// set: batches the full roster into groups of LABEL_BATCH (the header's own
// limit) and fires one getProfile per batch with a different
// atproto-accept-labelers group, merging every label any of them returns.
// Returns { profile, labellersMap } — labellersMap lets the caller resolve a
// label's `src` did to a human-readable labeler name.
export async function getProfileAllLabels(did, onProgress) {
  const base = await getProfile(did);
  const labellers = await loadAllLabelers();
  const labellersMap = new Map(labellers.map((l) => [l.did, l]));
  if (!labellers.length) return { profile: base, labellersMap };

  const batches = [];
  for (let i = 0; i < labellers.length; i += LABEL_BATCH) batches.push(labellers.slice(i, i + LABEL_BATCH));

  let done = 0;
  if (onProgress) onProgress(0, batches.length);
  await pooledEach(batches, LABEL_SCAN_CONCURRENCY, async (batch) => {
    const headers = { "atproto-accept-labelers": batch.map((l) => l.did).join(",") };
    try {
      const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, headers);
      mergeLabels(base.labels, p.labels);
    } catch {
      // one bad batch doesn't sink the scan — its labels are just missing
    }
    done++;
    if (onProgress) onProgress(done, batches.length);
  });

  return { profile: base, labellersMap };
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

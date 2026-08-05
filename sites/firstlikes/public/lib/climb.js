// climb.js — walk a Bluesky account's whole post history, oldest first, and
// find how many posts it took to land the first post at or above each
// like-count threshold.
//
// Oldest-first history without CAR/MST parsing: com.atproto.repo.listRecords
// defaults to newest-first (rkeys are timestamp-ordered TIDs, and listRecords
// walks from the highest one down) — but reverse=true walks it the other
// way, ascending, straight from the oldest record. So a plain cursor-paged
// listRecords(reverse: true) call against the account's own PDS already
// yields chronological order AND gives each record's real at:// uri for
// free — no need for the com.atproto.sync.getRepo CAR-download + MST-walk
// trick sites/cloutgraph and sites/activitygrid use elsewhere in this repo
// for "read someone's whole history" (that trick exists because those sites
// need collections like app.bsky.feed.like that have no listRecords-friendly
// "give me it all in one shot" shortcut that beats a cursor walk; here the
// reverse flag already gets us the same thing in one simpler code path).

const APPVIEW = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving about paste formats: @handle, bare handle, profile URL, or a DID.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split(/[/?#]/)[0];
  if (!a) throw new Error("enter a handle first");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${APPVIEW}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

// Resolve a DID doc's #atproto_pds service endpoint — did:plc via
// plc.directory, did:web via its own .well-known/did.json.
export async function resolvePds(did) {
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
  if (!svc || !svc.serviceEndpoint) throw new Error("couldn't find that account's PDS");
  return svc.serviceEndpoint.replace(/\/$/, "");
}

// A backstop against a runaway loop, not a real limit anyone should hit:
// 6000 pages * 100 records = 600,000 posts.
const MAX_PAGES = 6000;

// Every app.bsky.feed.post record the account has, oldest first, with its
// real at:// uri attached (record.uri, straight from listRecords — no CAR
// parse needed to recover it).
export async function fetchAllPosts(pds, did, onProgress) {
  const out = [];
  let cursor;
  for (let p = 0; p < MAX_PAGES; p++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", "app.bsky.feed.post");
    u.searchParams.set("limit", "100");
    u.searchParams.set("reverse", "true");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    const records = d.records || [];
    for (const rec of records) out.push(rec);
    if (onProgress) onProgress(out.length);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

const LIKE_BATCH = 25; // app.bsky.feed.getPosts caps at 25 uris/request
const CONCURRENCY = 8;

async function pooledEach(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
}

// Batch-resolves like counts for `uris` (25/request, ~8 requests in flight).
// A uri missing from a batch's response (deleted since, or moderation-hidden)
// just gets no entry — callers treat that as 0 likes, which is the honest
// answer for "we can no longer see a like count for this."
export async function fetchLikeCounts(uris, onProgress) {
  const counts = new Map();
  const batches = [];
  for (let i = 0; i < uris.length; i += LIKE_BATCH) batches.push(uris.slice(i, i + LIKE_BATCH));
  let done = 0;
  await pooledEach(batches, CONCURRENCY, async (batch) => {
    const u = new URL(`${APPVIEW}/app.bsky.feed.getPosts`);
    for (const uri of batch) u.searchParams.append("uris", uri);
    try {
      const d = await jget(u.toString());
      for (const post of d.posts || []) counts.set(post.uri, post.likeCount || 0);
    } catch (_) {
      // one batch failing (rate limit, transient network error) shouldn't
      // sink the whole crawl — those posts just read as 0 likes below.
    }
    done += batch.length;
    if (onProgress) onProgress(done, uris.length);
  });
  return counts;
}

// `posts` is oldest-first, each carrying a `likeCount`. Returns, for every
// threshold, the first (lowest-index) post at or above it — or null if the
// account never got there. `index` is 1-based ("it took them N posts").
export function findMilestones(posts, thresholds) {
  const found = new Map(thresholds.map((t) => [t, null]));
  let remaining = thresholds.length;
  for (let i = 0; i < posts.length && remaining > 0; i++) {
    const p = posts[i];
    for (const t of thresholds) {
      if (found.get(t) === null && p.likeCount >= t) {
        found.set(t, { index: i + 1, post: p });
        remaining--;
      }
    }
  }
  return thresholds.map((t) => ({ threshold: t, ...(found.get(t) || { index: null, post: null }) }));
}

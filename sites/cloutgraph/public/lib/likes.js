// likes.js — crawl a pool's likes to build a directed liker->author edge
// graph restricted to the pool itself.
//
// Bluesky's AppView only exposes app.bsky.feed.getActorLikes for the
// authenticated actor viewing their own likes — there's no anonymous "who
// did this person like" endpoint. But like records are ordinary public repo
// records, so we read them straight off each pool member's own PDS via
// com.atproto.repo.listRecords (no auth, CORS *). Each record's
// value.subject.uri is `at://<authorDid>/app.bsky.feed.post/<rkey>` — the
// author DID is embedded in the URI, no extra lookup needed. Finding the
// PDS itself means resolving the member's DID document (plc.directory for
// did:plc, well-known/did.json for did:web) for its #atproto_pds service
// endpoint.

const MAX_PAGES_PER_MEMBER = 3; // <=300 recent likes sampled per pool member
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

const pdsCache = new Map(); // did -> serviceEndpoint | null

async function resolvePds(did) {
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

async function listLikes(did, pds) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < MAX_PAGES_PER_MEMBER; p++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", "app.bsky.feed.like");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const rec of d.records || []) out.push(rec);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

function authorFromSubjectUri(uri) {
  const m = /^at:\/\/([^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

// Run `fn` over `items` with at most `limit` in flight at once.
async function pooledEach(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) || 1 }, worker),
  );
}

// Crawl each member's own PDS and record every author DID they liked
// (unfiltered — not restricted to the pool yet, so the same raw data can be
// re-filtered against a different pool later without re-crawling).
async function crawlPool(members, onProgress) {
  const rawByMember = new Map(); // did -> authorDid[]
  let done = 0;
  let resolvedCount = 0;
  let failedCount = 0;

  await pooledEach(members, CONCURRENCY, async (member) => {
    const pds = await resolvePds(member.did);
    if (!pds) {
      failedCount++;
      done++;
      if (onProgress) onProgress(done, members.length);
      return;
    }
    const likes = await listLikes(member.did, pds);
    resolvedCount++;
    const authorDids = [];
    for (const rec of likes) {
      const authorDid = authorFromSubjectUri(rec.value && rec.value.subject && rec.value.subject.uri);
      if (authorDid && authorDid !== member.did) authorDids.push(authorDid);
    }
    rawByMember.set(member.did, authorDids);
    done++;
    if (onProgress) onProgress(done, members.length);
  });

  return { rawByMember, resolvedCount, failedCount };
}

// Build the liker->author edge-count graph restricted to `poolDids`, from
// raw (unfiltered) liked-author-did lists per member.
function graphFromRaw(poolDids, rawByMember) {
  const counts = new Map(); // "from|to" -> count
  for (const [from, authorDids] of rawByMember) {
    if (!poolDids.has(from)) continue;
    for (const to of authorDids) {
      if (to === from || !poolDids.has(to)) continue;
      const key = from + "|" + to;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const edges = [];
  const givenInPool = {};
  const receivedInPool = {};
  for (const [key, count] of counts) {
    const [from, to] = key.split("|");
    edges.push({ from, to, count });
    givenInPool[from] = (givenInPool[from] || 0) + count;
    receivedInPool[to] = (receivedInPool[to] || 0) + count;
  }
  return { edges, givenInPool, receivedInPool };
}

// Crawl `pool`'s likes and build a liker->author edge-count graph, counting
// only likes where both liker and author are inside the pool. Returns:
//   { edges: [{from, to, count}], givenInPool: {did:n}, receivedInPool: {did:n},
//     resolvedCount, failedCount, rawByMember }
// `rawByMember` is kept around so backfillLowActivity() can recompute the
// graph over a swapped pool without re-crawling anyone already fetched here.
export async function buildLikeGraph(pool, { onProgress } = {}) {
  const { rawByMember, resolvedCount, failedCount } = await crawlPool(pool, onProgress);
  const poolDids = new Set(pool.map((p) => p.did));
  const { edges, givenInPool, receivedInPool } = graphFromRaw(poolDids, rawByMember);
  return { edges, givenInPool, receivedInPool, resolvedCount, failedCount, rawByMember };
}

// Below this many total in-pool likes (given + received), a member's PMI
// weights and HITS scores are noise from a tiny sample rather than real
// signal — one stray like can swing their whole row/column and let them
// dominate the ranking. See backfillLowActivity().
export const MIN_IN_POOL_LIKES = 5;

// Swap out any pool member with fewer than `threshold` total in-pool likes
// (given + received, per the crawl already done in `graph`) for the next
// candidate waiting in `overflow`. The rest of the graph is recomputed from
// the raw likes already crawled in `graph.rawByMember` — only the
// replacements themselves need a fresh PDS crawl, no re-fetching anyone
// already in scope. This runs once: replacements aren't re-checked against
// the threshold, so a still-sparse pool stays as-is rather than looping.
// Returns { pool, graph, swapped: [{removed, added}] } — `added` is null for
// a removed member with no replacement left in `overflow` (pool just shrinks).
export async function backfillLowActivity(pool, overflow, graph, { onProgress, threshold = MIN_IN_POOL_LIKES } = {}) {
  const activity = (did) => (graph.givenInPool[did] || 0) + (graph.receivedInPool[did] || 0);
  const removed = pool.filter((p) => activity(p.did) < threshold);
  if (!removed.length) return { pool, graph, swapped: [] };

  const removedSet = new Set(removed.map((p) => p.did));
  const kept = pool.filter((p) => !removedSet.has(p.did));
  const replacements = overflow.slice(0, removed.length);
  const newPool = kept.concat(replacements);

  const { rawByMember: newRaw, resolvedCount, failedCount } = replacements.length
    ? await crawlPool(replacements, onProgress)
    : { rawByMember: new Map(), resolvedCount: 0, failedCount: 0 };

  const mergedRaw = new Map(graph.rawByMember);
  for (const [did, authorDids] of newRaw) mergedRaw.set(did, authorDids);

  const poolDids = new Set(newPool.map((p) => p.did));
  const { edges, givenInPool, receivedInPool } = graphFromRaw(poolDids, mergedRaw);

  const swapped = removed.map((r, i) => ({ removed: r, added: replacements[i] || null }));

  return {
    pool: newPool,
    graph: {
      edges,
      givenInPool,
      receivedInPool,
      resolvedCount: graph.resolvedCount + resolvedCount,
      failedCount: graph.failedCount + failedCount,
      rawByMember: mergedRaw,
    },
    swapped,
  };
}

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

// Crawl `pool`'s likes and build a liker->author edge-count graph, counting
// only likes where both liker and author are inside the pool. Returns:
//   { edges: [{from, to, count}], givenInPool: {did:n}, receivedInPool: {did:n},
//     resolvedCount, failedCount }
export async function buildLikeGraph(pool, { onProgress } = {}) {
  const poolDids = new Set(pool.map((p) => p.did));
  const counts = new Map(); // "from|to" -> count
  let done = 0;
  let resolvedCount = 0;
  let failedCount = 0;

  await pooledEach(pool, CONCURRENCY, async (member) => {
    const pds = await resolvePds(member.did);
    if (!pds) {
      failedCount++;
      done++;
      if (onProgress) onProgress(done, pool.length);
      return;
    }
    const likes = await listLikes(member.did, pds);
    resolvedCount++;
    for (const rec of likes) {
      const authorDid = authorFromSubjectUri(rec.value && rec.value.subject && rec.value.subject.uri);
      if (!authorDid || authorDid === member.did || !poolDids.has(authorDid)) continue;
      const key = member.did + "|" + authorDid;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    done++;
    if (onProgress) onProgress(done, pool.length);
  });

  const edges = [];
  const givenInPool = {};
  const receivedInPool = {};
  for (const [key, count] of counts) {
    const [from, to] = key.split("|");
    edges.push({ from, to, count });
    givenInPool[from] = (givenInPool[from] || 0) + count;
    receivedInPool[to] = (receivedInPool[to] || 0) + count;
  }
  return { edges, givenInPool, receivedInPool, resolvedCount, failedCount };
}

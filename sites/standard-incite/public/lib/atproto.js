// atproto.js — PDS discovery and public repo reads against a mutual's own
// PDS. Trimmed from commonplace/public/lib/atproto.js (copy, don't abstract)
// — dropped resolveHandle/cleanHandle (moots.js already has its own, and
// this file only ever gets DIDs from moots.js's pool, never a raw handle),
// kept a `latestOnly` mode for listRecords (reverse + limit=1) so checking
// "when did they last post" is one request instead of a full
// page-to-exhaustion walk, plus a pooledEach helper (copied from
// sites/listcheck/public/lib/identity.js) for the bounded-concurrency
// fan-out over many mutuals' PDSes.

const PLC_DIR = "https://plc.directory";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function didDoc(did) {
  if (did.startsWith("did:plc:")) {
    const r = await fetch(`${PLC_DIR}/${did}`);
    return r.ok ? r.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
    const r = await fetch(`https://${domain}/.well-known/did.json`);
    return r.ok ? r.json() : null;
  }
  return null;
}

export async function resolvePds(did) {
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return svc?.serviceEndpoint || null;
  } catch {
    return null;
  }
}

// Paginated com.atproto.repo.listRecords walk, exhaustive by default — reads
// every record in the collection (no-arbitrary-caps: `notes/00-vision.md`'s
// hard rule 4). CAP is a backstop against a pathological repo, not a budget;
// it's set far above anything a real site.standard.publication list will
// ever reach. Pass `latestOnly: true` to fetch just the single newest record
// (limit=1, reverse=true) — used for "when did they last publish", which
// only ever needs the most recent one, not the whole history.
const CAP_PAGES = 400;

export async function listRecords(pdsUrl, repo, collection, { latestOnly = false } = {}) {
  const base = pdsUrl.replace(/\/$/, "");
  if (latestOnly) {
    const params = new URLSearchParams({ repo, collection, limit: "1", reverse: "true" });
    const d = await jget(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    return d.records || [];
  }
  const out = [];
  let cursor;
  for (let p = 0; p < CAP_PAGES; p++) {
    const params = new URLSearchParams({ repo, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d;
    try {
      d = await jget(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    } catch {
      break;
    }
    const records = d.records || [];
    out.push(...records);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

// Run `fn` over `items` with at most `limit` in flight at once. Copied from
// sites/listcheck/public/lib/identity.js. A politeness/browser-memory limit
// on how many simultaneous fetches hit different PDSes at once — every item
// still gets processed, this only paces how fast.
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

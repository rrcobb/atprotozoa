// atproto.js — read-side helpers: identity resolution, PDS discovery, and
// public AppView/PDS reads. Everything here hits public, unauthenticated
// endpoints — no session needed, this site never writes anything.
//
// Copy, don't abstract: trimmed from sites/areyoumad/public/lib/atproto.js,
// with getAuthorFeed/getFollowers added for vulnscope's own use.

const PUB = "https://api.bsky.app/xrpc";
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

// Forgiving handle/DID/URL parsing, copied from moot-bingo's resolveDid.
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

const pdsCache = new Map();
export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let pds = null;
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    pds = svc?.serviceEndpoint || null;
  } catch {}
  pdsCache.set(did, pds);
  return pds;
}

export async function getProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

// --- feed reads ---------------------------------------------------------

// Pages getAuthorFeed (own posts + reposts + replies, newest-first). Returns
// raw feed items ({ post, reply?, reason? }) — the caller decides what to do
// with reposts vs originals. `capPages` bounds how many 100-item pages we'll
// read from any one account.
export async function getAuthorFeed(did, capPages = 2) {
  const out = [];
  let cursor;
  for (let p = 0; p < capPages; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_with_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const items = d.feed || [];
    out.push(...items);
    cursor = d.cursor;
    if (!cursor || !items.length) break;
  }
  return out;
}

// --- repo reads (public, unauthenticated XRPC on the owner's own PDS) -------

// Page through listRecords newest-first, collecting raw records (so callers
// can read createdAt off rec.value). `capPages` bounds how many 100-record
// pages we'll read from any one repo — this is the literal "read your repo"
// step: follow records straight off the account's own PDS, not the AppView.
export async function listRecords(pdsUrl, repo, collection, capPages = 3) {
  const out = [];
  let cursor;
  for (let p = 0; p < capPages; p++) {
    const params = new URLSearchParams({ repo, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d;
    try {
      d = await jget(
        `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`,
      );
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

// --- graph (outgoing follows / followers) -----------------------------------

const GRAPH_PAGES = 3; // <= ~300 follows/followers scanned per account — plenty
                        // for a vibe read, bounded so one huge account can't
                        // run away paging thousands of items.

async function graphAll(endpoint, key, did, maxItems = Infinity) {
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
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor || out.length >= maxItems) break;
  }
  return out;
}

export async function getFollows(did, cap = 300) {
  return (await graphAll("app.bsky.graph.getFollows", "follows", did, cap)).slice(0, cap);
}

export async function getFollowers(did, cap = 300) {
  return (await graphAll("app.bsky.graph.getFollowers", "followers", did, cap)).slice(0, cap);
}

// atproto.js — read-side helpers: identity resolution, PDS discovery, public
// repo reads (getRecord/listRecords), and "moots" (mutual-follow) lookup.
//
// Copy, don't abstract: the identity/PDS bits are trimmed from
// trigrams/public/lib/oauth.js, the moots bits from
// moot-bingo/public/lib/moots.js. Everything here reads public,
// unauthenticated endpoints (the AppView + each user's own PDS) — no session
// needed. Writing (createRecord) stays in oauth.js's dpopFetch, called from
// index.html once a session exists.

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

export async function resolveHandleForDid(did) {
  try {
    const doc = await didDoc(did);
    const aka = (doc?.alsoKnownAs || []).find((a) => a.startsWith("at://"));
    if (aka) return aka.slice("at://".length);
  } catch {}
  return did;
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

// Does `likerDid` appear among the likes on `postUri`? Pages the public
// getLikes endpoint (newest-first) up to `capPages` * 100 likes — plenty to
// find one specific liker on anything but a viral post, and bounded so a
// single check can't run away scanning thousands of likes.
export async function didLike(postUri, likerDid, capPages = 3) {
  let cursor;
  for (let p = 0; p < capPages; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getLikes`);
    u.searchParams.set("uri", postUri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const likes = d.likes || [];
    if (likes.some((l) => l.actor?.did === likerDid)) return true;
    cursor = d.cursor;
    if (!cursor || !likes.length) break;
  }
  return false;
}

export async function getProfile(did) {
  try {
    return await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

// --- repo reads (public, unauthenticated XRPC on the owner's own PDS) -------

export async function getRecord(pdsUrl, repo, collection, rkey) {
  const params = new URLSearchParams({ repo, collection, rkey });
  return jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
}

// Page through listRecords, collecting records whose `value` passes `filter`
// (all records if omitted). `capPages` bounds how many 100-record pages we'll
// read from any one repo — a toy board doesn't need someone's entire history.
export async function listRecords(pdsUrl, repo, collection, filter, capPages = 5) {
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
    for (const rec of records) {
      if (!filter || filter(rec.value)) out.push(rec);
    }
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

// Page through listRecords newest-first (its default order — rkeys are
// timestamp-ordered TIDs and listRecords without `reverse` walks from the
// highest/most-recent one down), collecting records whose `value` passes
// `filter` and whose `createdAt` is >= `sinceMs` — then stops as soon as a
// record older than `sinceMs` shows up, instead of walking a whole repo's
// history just to find today's posts. `capPages` is a backstop for accounts
// that post a huge amount in a single day.
export async function listRecordsSince(pdsUrl, repo, collection, sinceMs, filter, capPages = 8) {
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
    let hitOld = false;
    for (const rec of records) {
      const t = Date.parse(rec.value?.createdAt || "");
      if (!Number.isFinite(t) || t < sinceMs) {
        hitOld = true;
        break;
      }
      if (!filter || filter(rec.value)) out.push(rec);
    }
    cursor = d.cursor;
    if (hitOld || !cursor || !records.length) break;
  }
  return out;
}

// --- graph / moots (mutual follows) ------------------------------------------

const GRAPH_PAGES = 12; // <= ~1200 follows/followers scanned per account

// `maxItems` stops paging as soon as enough items are collected — matters for
// getFollows below, where we only want the first `cap` follows and shouldn't
// pay for up to GRAPH_PAGES*100 items just to slice them away afterward.
// moots() (below) needs the full follows+followers sets to compute an
// accurate intersection, so it leaves maxItems at Infinity.
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

export async function getFollows(did, cap = 100) {
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did, cap);
  return follows.slice(0, cap);
}

// moots of `did` = follows ∩ followers (mutuals), capped — a board only needs
// "enough" moots to check edit permission and scan for marks, not an
// exhaustive census of a huge network. Same definition as moot-bingo.
export async function moots(did, cap = 60) {
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);
  const followerDids = new Set(followers.map((f) => f.did));
  const out = [];
  for (const f of follows) {
    if (!followerDids.has(f.did)) continue;
    out.push({ did: f.did, handle: f.handle, displayName: f.displayName || f.handle, avatar: f.avatar || "" });
    if (out.length >= cap) break;
  }
  return out;
}

export async function isMoot(did, ownerDid, cap = 60) {
  if (did === ownerDid) return true;
  const m = await moots(ownerDid, cap);
  return m.some((x) => x.did === did);
}

// Run `fn` over `items` with at most `limit` in flight at once. Plain-JS
// concurrency cap so "check 40 follows' repos for boards" doesn't fire 40
// requests at once or crawl one at a time.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i).catch(() => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

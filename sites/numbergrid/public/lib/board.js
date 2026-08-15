// board.js — identity resolution, reading/writing net.bisks.numbergrid.number
// records, and the pure number-set math (mex, grid sizing).
//
// Reads are unauthenticated: com.atproto.repo.listRecords is a public PDS
// endpoint, so anyone's board can be viewed (and shared) without them being
// signed in and without the viewer being signed in either — same pattern as
// sites/hyperobject's verifyOwnRecord (read a claimed author's own records
// straight off their PDS). Only adding a number needs an OAuth session,
// since that's the one write this site ever makes.

export const COLLECTION = "net.bisks.numbergrid.number";
const PLC_DIR = "https://plc.directory";
const PUB_API = "https://public.api.bsky.app/xrpc";

async function jget(url) {
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
  const d = await jget(`${PUB_API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function getProfile(did) {
  const p = await jget(`${PUB_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
  };
}

const pdsCache = new Map();

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let endpoint = null;
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await jget(`https://${host}/.well-known/did.json`);
    } else {
      doc = await jget(`${PLC_DIR}/${encodeURIComponent(did)}`);
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

const MAX_PAGES = 20; // 20 * 100 = 2000 numbers, plenty for a personal board

// Fetch every net.bisks.numbergrid.number record for `did`, deduped and
// sorted ascending by value. Unauthenticated — works for any public repo.
export async function fetchBoard(did) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find that account's PDS");
  const base = pds.replace(/\/$/, "");
  const seen = new Map(); // value -> earliest createdAt
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await jget(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    const records = Array.isArray(data.records) ? data.records : [];
    for (const rec of records) {
      const v = rec?.value?.value;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) continue;
      const createdAt = typeof rec?.value?.createdAt === "string" ? rec.value.createdAt : null;
      if (!seen.has(v) || (createdAt && createdAt < seen.get(v))) seen.set(v, createdAt);
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !records.length) break;
  }
  return [...seen.keys()].sort((a, b) => a - b);
}

// Write one number to the signed-in user's own PDS. Caller is expected to
// have already deduped against the current board.
export async function addNumber(session, dpopFetch, value) {
  const record = {
    $type: COLLECTION,
    value,
    createdAt: new Date().toISOString(),
  };
  const res = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, record }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "couldn't write that number to your PDS");
  return body;
}

// --- pure number-set math ------------------------------------------------

// The mex (minimum excludant): the smallest non-negative integer NOT in the
// set. Straight answer to @ponder.ooo's quoted question, computed live off
// whatever board you've actually built.
export function mex(sortedValues) {
  let m = 0;
  for (const v of sortedValues) {
    if (v === m) m++;
    else if (v > m) break;
  }
  return m;
}

export function digits(n) {
  return String(Math.abs(n)).length;
}

// Smallest side length s such that s*s >= count, minimum 1 — the board is
// always the smallest perfect square that fits every cell the board needs
// (recorded numbers plus the real gaps between them; see missingBetween).
export function gridSide(count) {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

// How many integers are missing between the smallest and largest value
// seen — e.g. [9, 10, 14] is missing 11, 12, 13, so 3. Numbers below the
// smallest value seen don't count as "missing"; the board starts at the
// first number you actually logged.
export function missingBetween(sortedValues) {
  let m = 0;
  for (let i = 1; i < sortedValues.length; i++) {
    m += Math.max(0, sortedValues[i] - sortedValues[i - 1] - 1);
  }
  return m;
}

// Lay out `total` grid cells (side*side, where total >= count +
// missingBetween(sortedValues)) for a sorted, deduped value list: every
// recorded number gets a cell, every missing integer strictly between the
// smallest and largest recorded value gets its own blank cell (one blank per
// missing number, no weighting or capping), and any cells still left over
// once every real gap is filled trail after the largest value as plain
// room-to-grow.
export function layoutCells(sortedValues, total) {
  const count = sortedValues.length;
  if (count === 0) return [];
  const cells = [{ value: sortedValues[0] }];
  for (let i = 1; i < count; i++) {
    const gap = sortedValues[i] - sortedValues[i - 1] - 1;
    for (let j = 0; j < gap; j++) cells.push({ empty: true });
    cells.push({ value: sortedValues[i] });
  }
  while (cells.length < total) cells.push({ empty: true });
  return cells;
}

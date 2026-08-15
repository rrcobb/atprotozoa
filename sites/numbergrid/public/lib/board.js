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

// Smallest side length s such that s*s >= n, minimum 1.
export function gridSide(n) {
  return Math.max(1, Math.ceil(Math.sqrt(n)));
}

// The board's side is the rounded-up square root of the largest number
// you've ever logged — not how many numbers you've recorded. Seeing just
// 7323 once gives you an 86x86 board (ceil(sqrt(7323)) = 86), same as
// seeing every number from 0 to 7323 would. gridSide(max + 1), not
// gridSide(max): using the bare max under-sizes the board by exactly one
// row/column whenever max itself is a perfect square (e.g. max=100 would
// otherwise give a 10x10 board with no cell for 100 — position 100 needs
// index 100, which only exists in a board of at least 101 cells).
export function boardSide(sortedValues) {
  if (sortedValues.length === 0) return 1;
  return gridSide(sortedValues[sortedValues.length - 1] + 1);
}

// Above this many cells, positionally laying out every blank (see
// layoutCells) means building/rendering tens of thousands to millions of
// DOM nodes — not a hypothetical, since an everyday large number (a phone
// number, a unix timestamp) is enough to trigger it now that board size
// tracks the largest value seen rather than how many numbers were logged.
// Past this size layoutCells falls back to a sparse layout: just the
// recorded numbers, no filler, so the page can't grind to a halt.
export const MAX_RENDER_CELLS = 10000;

// Lay out a side*side board positionally: cell index v (0-indexed) holds
// the recorded number v if it's been seen, else a blank. This is the full
// number line from 0 up to side*side-1, not a packed run of recorded
// values — every number you haven't seen yet gets its own real blank cell
// at its own position. Falls back to a sparse "recorded numbers only" list
// (length < side*side) above MAX_RENDER_CELLS; callers should check for
// that when deciding how many grid columns to actually draw.
export function layoutCells(sortedValues, side) {
  const total = side * side;
  if (total > MAX_RENDER_CELLS) {
    return sortedValues.map((v) => ({ value: v }));
  }
  const present = new Set(sortedValues);
  const cells = [];
  for (let v = 0; v < total; v++) {
    cells.push(present.has(v) ? { value: v } : { empty: true });
  }
  return cells;
}

// car.js — download an account's full repo as one CAR (Content Addressable
// aRchive) via com.atproto.sync.getRepo and pull out just the record types
// the caller wants, instead of paginating com.atproto.repo.listRecords one
// page at a time or capping at one page of app.bsky.feed.getAuthorFeed. One
// request gets every collection in the same download (no per-collection
// cursor walk, no page cap) — see sites/activitygrid, where this trick first
// shipped, for the full writeup of why it beats listRecords for "give me
// this person's whole history."
//
// Copy, don't abstract: this is the same CAR/DAG-CBOR parser as
// sites/cloutgraph/public/lib/car.js, copied in unmodified.

const CAR_MAX_BYTES = 100 * 1024 * 1024;
const CAR_MAX_BLOCKS = 600000;
const CAR_MAX_RECORDS_PER_TYPE = 5000;
const DAG_CBOR_CODEC = 0x71;

function readVarint(bytes, offset) {
  let result = 0, shift = 0, b;
  do {
    b = bytes[offset++];
    result += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
  } while (b >= 0x80);
  return [result, offset];
}

// Yields the raw dag-cbor bytes of every block in the CAR whose CID codec is
// dag-cbor (0x71) — skips the CAR header and any raw (blob) blocks. CIDv1 is
// read generically via varints (version, codec, multihash fn, multihash
// length) rather than assuming the usual fixed 36-byte sha2-256 shape, so a
// differently-hashed CID just gets skipped over correctly instead of
// desyncing the rest of the parse.
function* carBlocks(bytes) {
  let headerLen, offset;
  [headerLen, offset] = readVarint(bytes, 0);
  offset += headerLen; // skip the header block itself (CAR version + roots)

  while (offset < bytes.length) {
    let blockLen;
    [blockLen, offset] = readVarint(bytes, offset);
    if (!blockLen) break;
    const blockEnd = offset + blockLen;

    let o = offset;
    let cidCodec, hashLen;
    [, o] = readVarint(bytes, o); // CID version, always 1 in atproto repos
    [cidCodec, o] = readVarint(bytes, o);
    [, o] = readVarint(bytes, o); // multihash function code
    [hashLen, o] = readVarint(bytes, o);
    o += hashLen; // multihash digest, not needed for this walk

    if (cidCodec === DAG_CBOR_CODEC) yield bytes.subarray(o, blockEnd);
    offset = blockEnd;
  }
}

// Minimal DAG-CBOR decoder: unsigned/negative ints, byte/text strings,
// arrays, maps, floats, booleans/null, and tagged values (CID links, tag 42
// — we don't need to resolve them, just not choke on them). Indefinite-length
// items (info 31) aren't legal DAG-CBOR and aren't handled.
function cborDecode(bytes) {
  const st = { bytes, pos: 0 };
  return cborValue(st);
}

function cborArg(st, info) {
  const b = st.bytes;
  if (info < 24) return info;
  if (info === 24) { const v = b[st.pos]; st.pos += 1; return v; }
  if (info === 25) { const v = new DataView(b.buffer, b.byteOffset + st.pos, 2).getUint16(0, false); st.pos += 2; return v; }
  if (info === 26) { const v = new DataView(b.buffer, b.byteOffset + st.pos, 4).getUint32(0, false); st.pos += 4; return v; }
  if (info === 27) {
    const dv = new DataView(b.buffer, b.byteOffset + st.pos, 8);
    const hi = dv.getUint32(0, false), lo = dv.getUint32(4, false);
    st.pos += 8;
    return hi * 4294967296 + lo; // safe: string/array lengths never approach 2^53
  }
  throw new Error("unsupported CBOR length encoding " + info);
}

function cborValue(st) {
  const bytes = st.bytes;
  const initial = bytes[st.pos++];
  const majorType = initial >> 5;
  const info = initial & 0x1f;

  if (majorType === 7) {
    if (info === 20) return false;
    if (info === 21) return true;
    if (info === 22) return null;
    if (info === 23) return undefined;
    if (info === 25) { st.pos += 2; return NaN; } // float16 — unused by atproto records, not worth decoding
    if (info === 26) { const v = new DataView(bytes.buffer, bytes.byteOffset + st.pos, 4).getFloat32(0, false); st.pos += 4; return v; }
    if (info === 27) { const v = new DataView(bytes.buffer, bytes.byteOffset + st.pos, 8).getFloat64(0, false); st.pos += 8; return v; }
    return info; // simple value 0-19
  }

  const arg = cborArg(st, info);
  switch (majorType) {
    case 0: return arg;
    case 1: return -1 - arg;
    case 2: { const v = bytes.subarray(st.pos, st.pos + arg); st.pos += arg; return v; }
    case 3: { const v = new TextDecoder().decode(bytes.subarray(st.pos, st.pos + arg)); st.pos += arg; return v; }
    case 4: { const out = []; for (let i = 0; i < arg; i++) out.push(cborValue(st)); return out; }
    case 5: { const out = {}; for (let i = 0; i < arg; i++) { const k = cborValue(st); out[k] = cborValue(st); } return out; }
    case 6: return cborValue(st); // tagged value (e.g. CID link) — return the inner value untouched
    default: throw new Error("unsupported CBOR major type " + majorType);
  }
}

// Downloads `pds`'s repo CAR for `did` and returns every record whose $type
// is in `types` (a single string or an array), decoded straight from the
// dag-cbor block — no rkey, no CID, just the record body. Throws on network,
// oversize, or cancellation; callers can surface the failure directly.
export async function fetchRepoRecords(pds, did, types, onProgress, options = {}) {
  const wanted = new Set(Array.isArray(types) ? types : [types]);
  const signal = options.signal;
  if (onProgress) onProgress(`downloading repo CAR from ${pds} ...`);
  const res = await fetch(pds.replace(/\/$/, "") + "/xrpc/com.atproto.sync.getRepo?did=" + encodeURIComponent(did), { signal });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error("getRepo: " + msg);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > CAR_MAX_BYTES) throw new Error("repo CAR exceeds the 100 MB browser limit");

  const bytes = new Uint8Array(buf);
  const out = [];
  const typeCounts = new Map();
  let scanned = 0;
  let capped = false;
  // Tallied off every decoded block regardless of `wanted` — not a signal
  // this site otherwise tracks, but shimmermathlabs.com's bit ("anyone with
  // topchicken records deserves extra points") became a real bonus in
  // computeThrash, so it needs a real count. The client already fully
  // decodes each block to check its $type, so this piggybacks for free.
  let topchickenCount = 0;
  if (onProgress) onProgress(`parsing ${(buf.byteLength / 1048576).toFixed(1)} MB repo CAR ...`);

  for (const blockBytes of carBlocks(bytes)) {
    if (signal && signal.aborted) throw new DOMException("scan cancelled", "AbortError");
    scanned++;
    if (scanned > CAR_MAX_BLOCKS) { capped = true; break; }
    let obj;
    try { obj = cborDecode(blockBytes); } catch (_) { continue; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    if (typeof obj.$type === "string" && /topchicken/i.test(obj.$type)) topchickenCount++;
    if (!wanted.has(obj.$type)) continue;
    const typeCount = typeCounts.get(obj.$type) || 0;
    if (typeCount >= CAR_MAX_RECORDS_PER_TYPE) { capped = true; continue; }
    typeCounts.set(obj.$type, typeCount + 1);
    out.push(obj);
    if (onProgress && scanned % 1000 === 0) onProgress(`scanning repo CAR... ${out.length} matching records so far`);
  }

  return { records: out, bytes: buf.byteLength, topchickenCount, capped };
}

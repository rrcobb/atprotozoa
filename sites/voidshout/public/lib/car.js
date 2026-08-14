// car.js — download an account's repo as one CAR (Content Addressable
// aRchive) via com.atproto.sync.getRepo, decode the dag-cbor blocks, AND
// walk the actual MST (Merkle Search Tree) to recover each record's real
// collection/rkey — not just "some record shaped like a post," but "this
// exact at://did/collection/rkey." That rkey is what CAR import needs for
// real: matching against already-imported posts and building a real
// sourcePostUri. Base parser copied from sites/trigrams/public/lib/car.js
// (itself from activitygrid); the MST walk (walkMst, fetchRepoRecordsWithKeys)
// is new here — this is the "don't fake hard atproto pieces" piece of the
// brief, done for real instead of stubbed.
//
// MST walk follows the atproto repo spec: a node is {l: CID|null, e: entries},
// each entry {p: sharedPrefixLen, k: keySuffixBytes, v: valueCid, t: CID|null}.
// In-order traversal (left subtree, then each entry, then that entry's right
// subtree) with `p` counted against the immediately-preceding key in sorted
// order reconstructs every full "collection/rkey" key with its value CID.

const CAR_MAX_BYTES = 200 * 1024 * 1024; // bail (caller falls back to listRecords) rather than parse a repo this big in-tab
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

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Yields {cidHex, bytes} for every dag-cbor block in the CAR (skips raw/blob
// blocks). CIDv1 is read generically via varints rather than assuming a
// fixed 36-byte sha2-256 shape.
function* carBlocks(bytes) {
  let headerLen, offset;
  [headerLen, offset] = readVarint(bytes, 0);
  offset += headerLen; // header decoded separately by decodeHeader(), if the caller wants roots

  while (offset < bytes.length) {
    let blockLen;
    [blockLen, offset] = readVarint(bytes, offset);
    if (!blockLen) break;
    const blockEnd = offset + blockLen;
    const cidStart = offset;

    let o = offset;
    let cidCodec, hashLen;
    [, o] = readVarint(bytes, o); // CID version, always 1 in atproto repos
    [cidCodec, o] = readVarint(bytes, o);
    [, o] = readVarint(bytes, o); // multihash function code
    [hashLen, o] = readVarint(bytes, o);
    o += hashLen; // multihash digest

    if (cidCodec === DAG_CBOR_CODEC) {
      yield { cidHex: hex(bytes.subarray(cidStart, o)), bytes: bytes.subarray(o, blockEnd) };
    }
    offset = blockEnd;
  }
}

function decodeHeader(bytes) {
  const [headerLen] = readVarint(bytes, 0);
  const [, afterLen] = readVarint(bytes, 0);
  const header = cborDecode(bytes.subarray(afterLen, afterLen + headerLen));
  const roots = (header.roots || []).map((r) => (r && r.__cid ? hex(r.__cid) : null)).filter(Boolean);
  return { roots };
}

// Minimal DAG-CBOR decoder: unsigned/negative ints, byte/text strings,
// arrays, maps, floats, booleans/null. Tag 42 (a CID link) decodes to
// {__cid: Uint8Array} — the raw CID bytes, matchable against carBlocks()'s
// cidHex via hex() — instead of being silently passed through, since the
// MST walk needs to actually follow those links.
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
    if (info === 25) { st.pos += 2; return NaN; }
    if (info === 26) { const v = new DataView(bytes.buffer, bytes.byteOffset + st.pos, 4).getFloat32(0, false); st.pos += 4; return v; }
    if (info === 27) { const v = new DataView(bytes.buffer, bytes.byteOffset + st.pos, 8).getFloat64(0, false); st.pos += 8; return v; }
    return info;
  }

  const arg = cborArg(st, info);
  switch (majorType) {
    case 0: return arg;
    case 1: return -1 - arg;
    case 2: { const v = bytes.subarray(st.pos, st.pos + arg); st.pos += arg; return v; }
    case 3: { const v = new TextDecoder().decode(bytes.subarray(st.pos, st.pos + arg)); st.pos += arg; return v; }
    case 4: { const out = []; for (let i = 0; i < arg; i++) out.push(cborValue(st)); return out; }
    case 5: { const out = {}; for (let i = 0; i < arg; i++) { const k = cborValue(st); out[k] = cborValue(st); } return out; }
    case 6: {
      const tagNum = arg;
      const inner = cborValue(st);
      if (tagNum === 42 && inner instanceof Uint8Array) return { __cid: inner.subarray(1) }; // drop multibase-identity prefix byte
      return inner;
    }
    default: throw new Error("unsupported CBOR major type " + majorType);
  }
}

// In-order MST walk. `state` threads the previously-emitted key's raw bytes
// through the whole recursion (shared prefix `p` is counted against it, per
// spec) — a plain object passed by reference, not a return value, because
// the "previous key" context has to survive across sibling/parent frames.
function* walkMst(blocksByCid, nodeCidHex, state) {
  const node = blocksByCid.get(nodeCidHex);
  if (!node) return;
  if (node.l && node.l.__cid) yield* walkMst(blocksByCid, hex(node.l.__cid), state);
  for (const entry of node.e || []) {
    const p = entry.p || 0;
    const keyBytes = new Uint8Array(p + entry.k.length);
    keyBytes.set(state.prevKeyBytes.subarray(0, p), 0);
    keyBytes.set(entry.k, p);
    const key = new TextDecoder().decode(keyBytes);
    if (entry.v && entry.v.__cid) yield { key, valueCidHex: hex(entry.v.__cid) };
    state.prevKeyBytes = keyBytes;
    if (entry.t && entry.t.__cid) yield* walkMst(blocksByCid, hex(entry.t.__cid), state);
  }
}

/**
 * Downloads `pds`'s repo CAR for `did`, walks the real MST, and returns
 * every record in `collection` as {uri, rkey, value}. Throws on network/
 * oversize/parse failure — callers should catch and fall back to
 * com.atproto.repo.listRecords (always correct, just slower for a big repo).
 */
export async function fetchRepoRecordsWithKeys(pds, did, collection, onProgress) {
  onProgress?.(`downloading repo CAR from ${pds} ...`);
  const res = await fetch(pds.replace(/\/$/, "") + "/xrpc/com.atproto.sync.getRepo?did=" + encodeURIComponent(did));
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error("getRepo: " + msg);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > CAR_MAX_BYTES) throw new Error("repo CAR too large to parse in-tab");
  const bytes = new Uint8Array(buf);

  onProgress?.(`parsing ${(buf.byteLength / 1048576).toFixed(1)} MB repo CAR ...`);
  const { roots } = decodeHeader(bytes);
  if (!roots.length) throw new Error("CAR header has no root");

  const blocksByCid = new Map();
  for (const { cidHex, bytes: blockBytes } of carBlocks(bytes)) {
    try {
      blocksByCid.set(cidHex, cborDecode(blockBytes));
    } catch {
      // one bad block shouldn't sink the whole parse — it just won't resolve as an MST link
    }
  }

  const commit = blocksByCid.get(roots[0]);
  if (!commit || !commit.data || !commit.data.__cid) throw new Error("couldn't find repo commit / MST root");
  const mstRootHex = hex(commit.data.__cid);

  onProgress?.("walking the MST for real collection/rkey paths ...");
  const out = [];
  for (const { key, valueCidHex } of walkMst(blocksByCid, mstRootHex, { prevKeyBytes: new Uint8Array(0) })) {
    const slash = key.indexOf("/");
    if (slash < 0) continue;
    const keyCollection = key.slice(0, slash);
    const rkey = key.slice(slash + 1);
    if (keyCollection !== collection) continue;
    const value = blocksByCid.get(valueCidHex);
    if (!value) continue;
    out.push({ uri: `at://${did}/${collection}/${rkey}`, rkey, value });
  }
  return out;
}

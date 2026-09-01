// car.js — download an account's full repo as one CAR (Content Addressable
// aRchive) via com.atproto.sync.getRepo and pull out every record of the
// type(s) the caller wants, instead of paginating a listRecords cursor walk
// one page at a time. One request gets a voter's *entire* vote history in one
// shot, no per-repo page cap — see notes/40-new-site-playbook.md's cee.wtf
// thread, 2026-08-25: "stop using paginated listrecord calls... stop being
// afraid of just loading a ton of data." Copied verbatim from
// sites/backscroll/public/lib/car.js (itself copied from sites/beefcheck via
// sites/ngmi) — copy, don't abstract.

const CAR_MAX_BYTES = 200 * 1024 * 1024; // bail (caller should just skip this repo) rather than parse a repo this big in-tab
const CID_LINK = Symbol("cidLink"); // marks a decoded CBOR tag-42 value as a CID link, keyed by readCid's string form

function readVarint(bytes, offset) {
  let result = 0, shift = 0, b;
  do {
    b = bytes[offset++];
    result += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
  } while (b >= 0x80);
  return [result, offset];
}

function readCid(bytes, offset) {
  let o = offset;
  let version, codec, hashFn, hashLen;
  [version, o] = readVarint(bytes, o);
  [codec, o] = readVarint(bytes, o);
  [hashFn, o] = readVarint(bytes, o);
  [hashLen, o] = readVarint(bytes, o);
  const digest = bytes.subarray(o, o + hashLen);
  o += hashLen;
  let hex = "";
  for (let i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, "0");
  return [`${version}:${codec}:${hashFn}:${hex}`, o];
}

function* carBlocksByCid(bytes) {
  let headerLen, offset;
  [headerLen, offset] = readVarint(bytes, 0);
  offset += headerLen;

  while (offset < bytes.length) {
    let blockLen;
    [blockLen, offset] = readVarint(bytes, offset);
    if (!blockLen) break;
    const blockEnd = offset + blockLen;

    let o = offset;
    let cidKey;
    [cidKey, o] = readCid(bytes, o);

    yield { cidKey, bytes: bytes.subarray(o, blockEnd) };
    offset = blockEnd;
  }
}

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

function cborValue(st, linkCids) {
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
    case 4: { const out = []; for (let i = 0; i < arg; i++) out.push(cborValue(st, linkCids)); return out; }
    case 5: { const out = {}; for (let i = 0; i < arg; i++) { const k = cborValue(st, linkCids); out[k] = cborValue(st, linkCids); } return out; }
    case 6: {
      // Tagged value. Tag 42 is a CID link, encoded as a byte string with a
      // leading 0x00 "identity" multibase prefix byte before the raw CID.
      const tag = arg;
      const inner = cborValue(st, linkCids);
      if (linkCids && tag === 42 && inner instanceof Uint8Array) {
        const raw = inner[0] === 0 ? inner.subarray(1) : inner;
        const [cidKey] = readCid(raw, 0);
        return { [CID_LINK]: cidKey };
      }
      return inner; // untouched — fine for record bodies, which never need to resolve a link
    }
    default: throw new Error("unsupported CBOR major type " + majorType);
  }
}

// Downloads `pds`'s repo CAR for `did` in one request and walks the repo's
// MST (from the commit block named in the CAR header's root, through the
// prefix-compressed key/CID tree) to recover, for every record whose $type
// is in `types` (a single string or an array), its rkey — returning
// `{ uri: "at://<did>/<collection>/<rkey>", value }`. Records come back in
// ascending rkey order (the MST's in-order walk), which for TID-keyed
// collections like net.bisks.influential25.vote is already oldest-first —
// exactly the order the cooldown/self-vote replay logic needs per voter.
// Throws on network/oversize/malformed-CAR failure; caller should skip this
// repo and move on rather than let one broken PDS stall the whole backfill.
export async function fetchRepoRecordsWithKeys(pds, did, types, onProgress) {
  const wanted = new Set(Array.isArray(types) ? types : [types]);
  if (onProgress) onProgress(`downloading repo CAR from ${pds} ...`);
  const res = await fetch(pds.replace(/\/$/, "") + "/xrpc/com.atproto.sync.getRepo?did=" + encodeURIComponent(did));
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error("getRepo: " + msg);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > CAR_MAX_BYTES) throw new Error("repo CAR too large to parse in-tab");
  const bytes = new Uint8Array(buf);

  if (onProgress) onProgress(`parsing ${(buf.byteLength / 1048576).toFixed(1)} MB repo CAR ...`);

  const blockMap = new Map();
  for (const { cidKey, bytes: blockBytes } of carBlocksByCid(bytes)) {
    blockMap.set(cidKey, blockBytes);
  }

  let headerLen, off;
  [headerLen, off] = readVarint(bytes, 0);
  const header = cborValue({ bytes: bytes.subarray(off, off + headerLen), pos: 0 }, true);
  const rootLink = header.roots && header.roots[0];
  if (!rootLink || !rootLink[CID_LINK]) throw new Error("CAR header missing root CID");
  const commitBytes = blockMap.get(rootLink[CID_LINK]);
  if (!commitBytes) throw new Error("commit block missing from CAR");
  const commit = cborValue({ bytes: commitBytes, pos: 0 }, true);
  const rootMstKey = commit.data && commit.data[CID_LINK];
  if (!rootMstKey) throw new Error("commit missing MST root");

  const out = [];
  function walk(nodeKey) {
    if (!nodeKey) return;
    const nodeBytes = blockMap.get(nodeKey);
    if (!nodeBytes) return; // referenced block missing from this CAR — skip, partial results beat a thrown error
    let node;
    try { node = cborValue({ bytes: nodeBytes, pos: 0 }, true); } catch { return; }
    if (node.l && node.l[CID_LINK]) walk(node.l[CID_LINK]);
    let lastKey = "";
    for (const entry of node.e || []) {
      const suffix = new TextDecoder().decode(entry.k);
      const fullKey = lastKey.slice(0, entry.p) + suffix;
      lastKey = fullKey;
      const recCidKey = entry.v && entry.v[CID_LINK];
      const recBytes = recCidKey && blockMap.get(recCidKey);
      if (recBytes) {
        let rec;
        try { rec = cborDecode(recBytes); } catch { rec = null; }
        if (rec && wanted.has(rec.$type)) {
          out.push({ uri: `at://${did}/${fullKey}`, value: rec });
          if (onProgress && out.length % 200 === 0) onProgress(`walking repo CAR... ${out.length} matching records so far`);
        }
      }
      if (entry.t && entry.t[CID_LINK]) walk(entry.t[CID_LINK]);
    }
  }
  walk(rootMstKey);

  return { records: out, bytes: buf.byteLength };
}

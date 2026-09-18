// build-quotes.js — pre-computes public/data/quotes.json once, at build
// time, instead of every visitor's browser downloading and scoring
// brennan.computer's entire repo CAR on page load.
//
// @dave.9000ish.uk (the site's own requester), after the first version
// shipped: "you don't need to download the car everytime. the posts you've
// picked are fine" — the picks were good, the per-visit re-download wasn't.
// A recursive, synchronous MST walk over 11k+ posts on the main thread is
// also the likely reason the page reportedly wouldn't load: nothing in
// loadQuotes() blocked *rendering*, but a multi-second frozen tab reads as
// "didn't load" to a visitor.
//
// This still reads the *entire* repo once (no-arbitrary-caps rule) — the cap
// moved from "how often" to "how many times," not from "how much."
//
//   node build-quotes.js   # writes ./public/data/quotes.json
//
// Re-run by hand if his profile picks up new posts worth surfacing.
//
// The CAR/DAG-CBOR parser and PDS/profile lookups below are a plain
// CommonJS copy of public/lib/car.js and public/lib/identity.js (those files
// are ES modules, for the browser/Worker bundler; this script runs under
// plain `node`, which resolves .js as CommonJS without a package.json
// "type": "module" — so it gets its own copy rather than fighting Node's
// module-format resolution, same pattern as sites/ceemilarity/build-profile.js).
// Needs the *keyed* MST walk (not the flat block scan some other copies use)
// because quotes link back to the exact post, which only the tree gives you.

const fs = require("node:fs");
const path = require("node:path");

const HANDLE = "brennan.computer";
const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// ---- identity (copy of public/lib/identity.js) ----

async function resolveDid(handle) {
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!d.did) throw new Error(`couldn't resolve "${handle}"`);
  return d.did;
}

async function resolvePds(did) {
  const doc = await jget(`https://plc.directory/${encodeURIComponent(did)}`);
  const svc = (doc.service || []).find(
    (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  return (svc && svc.serviceEndpoint) || null;
}

async function getProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

// ---- CAR/DAG-CBOR parsing, keyed variant (copy of public/lib/car.js) ----

const CAR_MAX_BYTES = 200 * 1024 * 1024; // matches public/lib/car.js's in-tab bound; no reason to raise it for a one-time build-time read
const CID_LINK = Symbol("cidLink");

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
    return hi * 4294967296 + lo;
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
    case 4: { const out = []; for (let i = 0; i < arg; i++) out.push(cborValue(st, linkCids)); return out; }
    case 5: { const out = {}; for (let i = 0; i < arg; i++) { const k = cborValue(st, linkCids); out[k] = cborValue(st, linkCids); } return out; }
    case 6: {
      const tag = arg;
      const inner = cborValue(st, linkCids);
      if (linkCids && tag === 42 && inner instanceof Uint8Array) {
        const raw = inner[0] === 0 ? inner.subarray(1) : inner;
        const [cidKey] = readCid(raw, 0);
        return { [CID_LINK]: cidKey };
      }
      return inner;
    }
    default: throw new Error("unsupported CBOR major type " + majorType);
  }
}

async function fetchRepoRecordsWithKeys(pds, did, type) {
  process.stderr.write(`downloading repo CAR from ${pds} ...\n`);
  const res = await fetch(pds.replace(/\/$/, "") + "/xrpc/com.atproto.sync.getRepo?did=" + encodeURIComponent(did));
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error("getRepo: " + msg);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > CAR_MAX_BYTES) throw new Error("repo CAR too large to parse");
  const bytes = new Uint8Array(buf);
  process.stderr.write(`parsing ${(buf.byteLength / 1048576).toFixed(1)} MB repo CAR ...\n`);

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
    if (!nodeBytes) return;
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
        if (rec && rec.$type === type) {
          out.push({ uri: `at://${did}/${fullKey}`, value: rec });
          if (out.length % 500 === 0) process.stderr.write(`walking repo CAR... ${out.length} matching records so far\n`);
        }
      }
      if (entry.t && entry.t[CID_LINK]) walk(entry.t[CID_LINK]);
    }
  }
  walk(rootMstKey);

  return out;
}

// ---- scoring (same three-tier word lists as the original in-browser scorer) ----

const QUOTES_TO_SHOW = 6; // a curated highlight reel, not a cap on what got read — the whole repo is downloaded first

const STRONG_WORDS = [
  "wedding", "married", "marriage", "marry", "marrying", "fiance", "fiancé",
  "fiancee", "fiancée", "vow", "vows", "bride", "groom", "honeymoon", "altar",
  "tie the knot", "best man", "maid of honor",
];
const VOICE_WORDS = [
  "magic", "magical", "alchemy", "alchemical", "vibrance", "vibrant",
  "cosmic", "transform", "transformed", "eternal",
];
const WARM_WORDS = ["love", "forever", "soulmate", "together", "promise", "commitment", "spark"];

function scorePost(text) {
  const t = text.toLowerCase();
  let score = 0;
  for (const w of STRONG_WORDS) if (new RegExp(`\\b${w}\\b`).test(t)) score += 3;
  for (const w of VOICE_WORDS) if (new RegExp(`\\b${w}\\b`).test(t)) score += 2;
  for (const w of WARM_WORDS) if (new RegExp(`\\b${w}\\b`).test(t)) score += 1;
  return score;
}

async function main() {
  process.stderr.write(`resolving @${HANDLE} ...\n`);
  const did = await resolveDid(HANDLE);
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find his PDS");

  const records = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post");
  process.stderr.write(`read ${records.length} posts\n`);

  const candidates = [];
  for (const r of records) {
    const v = r.value;
    const text = (v.text || "").trim();
    if (!text || text.length < 6 || text.length > 240) continue;
    if (v.reply) continue; // standalone posts only — a reply quoted alone loses its context
    if (/https?:\/\/|\.(com|net|org|io)\b/i.test(text)) continue; // link-share posts don't quote well on their own
    const score = scorePost(text);
    if (score <= 0) continue;
    const rkey = r.uri.split("/").pop();
    candidates.push({
      text,
      score,
      createdAt: v.createdAt ? Date.parse(v.createdAt) : 0,
      url: `https://bsky.app/profile/${HANDLE}/post/${rkey}`,
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
  const picked = candidates.slice(0, QUOTES_TO_SHOW).map(({ text, url }) => ({ text, url }));

  let fallbackBio = null;
  if (!picked.length) {
    process.stderr.write("no scoring hits at all — falling back to his bio\n");
    const profile = await getProfile(did);
    fallbackBio = profile.description || "unlicensed back alley alchemy";
  }

  const out = {
    generatedAt: new Date().toISOString(),
    totalPosts: records.length,
    handle: HANDLE,
    picked,
    fallbackBio,
  };

  const outPath = path.join(__dirname, "public", "data", "quotes.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  process.stderr.write(`wrote ${outPath} — ${picked.length} quotes picked from ${records.length} posts\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

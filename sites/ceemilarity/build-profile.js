// Bakes cee.wtf's own style profile into public/data/cee-profile.json — the
// baseline every visitor's account gets compared against.
//
// Re-fetching and re-analyzing cee's whole post history on every visitor's
// page load would be slow and wasteful for a baseline that changes slowly.
// So this runs by hand instead, same pattern as og-gen.mjs: a build-time
// script, not a request-time one. Re-run it to refresh the baseline as cee
// keeps posting:
//
//   node build-profile.js
//
// Pulls cee's whole repo as one com.atproto.sync.getRepo CAR download off
// their own PDS — same "cars instead of looping on the read endpoint" swap
// @bisks.net asked for on public/index.html and src/index.ts — falling back
// to the old paginated app.bsky.feed.getAuthorFeed walk if the PDS can't be
// resolved or the CAR fetch/parse fails. The CAR/DAG-CBOR parser here is a
// plain CommonJS copy of public/lib/car.js's (that file is an ES module, for
// the browser/Worker bundlers; this script runs under plain `node`, which
// resolves .js as CommonJS without a package.json "type": "module" — so it
// gets its own copy rather than fighting Node's module-format resolution).
//
// House style: self-contained, copy-don't-abstract, no secrets (this only
// hits the public, unauthenticated AppView and each account's own PDS).

const fs = require("node:fs");
const path = require("node:path");
const engine = require("./public/lib/style-engine.js");

const HANDLE = "cee.wtf";
const API = "https://public.api.bsky.app/xrpc/";
const MAX_PAGES = 30; // fallback-only cap, see fetchPostsViaFeed

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""));
  if (!res.ok) throw new Error(`${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---- PDS resolution (copy of public/lib/identity.js's resolvePds) ----

async function resolvePds(did) {
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
    } else {
      doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
    }
    const svc = (doc.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return (svc && svc.serviceEndpoint) || null;
  } catch (_) {
    return null;
  }
}

// ---- CAR/DAG-CBOR parsing (copy of public/lib/car.js, as CommonJS) ----

const CAR_MAX_BYTES = 200 * 1024 * 1024; // bail (fall back to the feed walk) rather than parse a repo this big
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
    if (info === 25) { st.pos += 2; return NaN; } // float16 — unused by atproto records
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

async function fetchRepoRecords(pds, did, type) {
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
  const out = [];
  for (const blockBytes of carBlocks(bytes)) {
    let obj;
    try { obj = cborDecode(blockBytes); } catch (_) { continue; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || obj.$type !== type) continue;
    out.push(obj);
  }
  return out;
}

// ---- fallback: the old paginated getAuthorFeed walk ----

async function fetchPostsViaFeed(did) {
  const posts = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    const data = await xrpc("app.bsky.feed.getAuthorFeed", params);
    for (const item of data.feed || []) {
      if (item.reason) continue; // repost, not their own words
      const post = item.post;
      if (!post || !post.record || post.author?.did !== did) continue;
      posts.push({ text: post.record.text || "", createdAt: post.record.createdAt, isReply: !!post.record.reply });
    }
    cursor = data.cursor;
    process.stderr.write(`page ${page + 1}: ${posts.length} posts so far\n`);
    if (!cursor || !data.feed || !data.feed.length) break;
  }
  return posts;
}

async function fetchAllPosts(did) {
  const pds = await resolvePds(did);
  if (pds) {
    try {
      const records = await fetchRepoRecords(pds, did, "app.bsky.feed.post");
      const posts = records
        .map((r) => ({ text: r.text || "", createdAt: r.createdAt, isReply: !!r.reply }))
        .filter((p) => p.text);
      if (posts.length) return posts;
    } catch (err) {
      process.stderr.write(`repo CAR unavailable (${err.message}) — falling back to a feed walk\n`);
    }
  }
  return fetchPostsViaFeed(did);
}

async function main() {
  const identity = await xrpc("com.atproto.identity.resolveHandle", { handle: HANDLE });
  const did = identity.did;
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  const posts = await fetchAllPosts(did);
  const analysis = engine.analyze(posts);

  const out = {
    handle: profile.handle,
    did,
    displayName: profile.displayName || profile.handle,
    avatar: profile.avatar || null,
    generatedAt: new Date().toISOString(),
    sampleSize: posts.length,
    ...analysis,
  };

  const outPath = path.join(__dirname, "public", "data", "cee-profile.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error(`wrote ${outPath} (${posts.length} posts analyzed)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

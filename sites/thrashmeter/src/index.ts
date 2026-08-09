// thrashmeter Worker — thrashmeter.bisks.net
//
// Enter a Bluesky handle, get a "thrashing score" out of 100 — how chaotic
// and frenetic the account's activity looks, read off its *entire* repo
// (every collection: posts, likes, reposts, follows, blocks, lists, feed
// generators, gates — not just a recent-posts sample). The score is computed
// twice, independently, from the exact same rules:
//
//   - public/index.html computes it client-side (a profile fetch plus the
//     account's whole repo, downloaded as one CAR straight off its own PDS
//     via com.atproto.sync.getRepo — see public/lib/car.js) for instant
//     feedback.
//   - This file computes it again, server-side in the Thrashboard Durable
//     Object, from nothing but the handle the client sends — it re-resolves
//     the PDS and re-downloads the same CAR itself and recomputes from
//     scratch. The client's own number is never trusted or stored; only what
//     the server independently derives goes on the leaderboard. Copied
//     straight from sites/intrigue (same requester, same "verify by
//     re-fetching, not by trusting" pattern), scoring rules swapped out.
//
// The scoring rules below are intentionally duplicated (not imported) in
// public/index.html — copy, don't abstract, even within one site, because
// one copy runs in a browser and the other in a Worker. Likewise the CAR/
// DAG-CBOR parser and PDS resolver below are the same code as
// public/lib/car.js and public/lib/identity.js, ported to TypeScript rather
// than imported — a Worker can't import a browser ES module.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOARD: DurableObjectNamespace;
}

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/leaderboard" || url.pathname === "/api/submit") {
      const id = env.BOARD.idFromName("global");
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }
    // /s/<handle> — a distinct, shareable, per-person URL. A plain static
    // page would serve the same og:title/description/url for every score,
    // so Bluesky's link-unfurl cache would show one generic card forever no
    // matter who's shared. See notes/45-sharing-and-virality.md and
    // sites/didscope/src/index.ts (renderShare), which this is ported from.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 30 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

// --- PDS resolution + CAR/DAG-CBOR parsing (ported from public/lib/car.js
// and public/lib/identity.js — see those files for the fuller writeup) ---

async function resolvePds(did: string): Promise<string | null> {
  try {
    let doc: any;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
    } else {
      doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
    }
    const svc = (doc.service || []).find(
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return (svc && svc.serviceEndpoint) || null;
  } catch {
    return null;
  }
}

function authorFromUri(uri: string | undefined): string | null {
  const m = /^at:\/\/([^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

// Bail out (fall back to getAuthorFeed) rather than let a fetch to an
// oversized repo eat unbounded memory/download time. Was 64MB until
// 2026-08-09, when @catblanketflower.yuwakisa.com's own 74.2MiB/257k-block
// repo (30k posts, 168k likes) tripped it: the fallback returns only 50
// recent posts and *zero* non-post records, which is why they still saw
// "trigger-happy with the block button" and "all over the protocol" read
// zero, and why their rapid-fire-bursts score dropped from the client's
// full-repo +20 to a 50-post-sample +6 — not a decode-budget issue, the
// server never got past this line. Raised to give real headroom above a
// confirmed real repo of that size; a 100MiB buffer plus the (still capped,
// see CAR_MAX_*_RECORDS_DECODED below) decoded objects comfortably fits
// Workers' 128MB isolate memory ceiling.
const CAR_MAX_BYTES = 100 * 1024 * 1024;
const DAG_CBOR_CODEC = 0x71;

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let result = 0, shift = 0, b: number;
  do {
    b = bytes[offset++];
    result += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
  } while (b >= 0x80);
  return [result, offset];
}

// Unbounded — identical to public/lib/car.js's copy. The CPU-time guard
// lives in fetchRepoRecords below, not here, because it's a Worker-only
// concern (the browser has no CPU-time kill switch to defend against).
function* carBlocks(bytes: Uint8Array): Generator<Uint8Array> {
  let headerLen: number, offset: number;
  [headerLen, offset] = readVarint(bytes, 0);
  offset += headerLen; // skip the header block itself (CAR version + roots)

  while (offset < bytes.length) {
    let blockLen: number;
    [blockLen, offset] = readVarint(bytes, offset);
    if (!blockLen) break;
    const blockEnd = offset + blockLen;

    let o = offset;
    let cidCodec: number, hashLen: number;
    [, o] = readVarint(bytes, o); // CID version, always 1 in atproto repos
    [cidCodec, o] = readVarint(bytes, o);
    [, o] = readVarint(bytes, o); // multihash function code
    [hashLen, o] = readVarint(bytes, o);
    o += hashLen; // multihash digest, not needed for this walk

    if (cidCodec === DAG_CBOR_CODEC) yield bytes.subarray(o, blockEnd);
    offset = blockEnd;
  }
}

interface CborState {
  bytes: Uint8Array;
  pos: number;
}

function cborDecode(bytes: Uint8Array): any {
  const st: CborState = { bytes, pos: 0 };
  return cborValue(st);
}

function cborArg(st: CborState, info: number): number {
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

function cborValue(st: CborState): any {
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
    case 4: { const out: any[] = []; for (let i = 0; i < arg; i++) out.push(cborValue(st)); return out; }
    case 5: { const out: Record<string, any> = {}; for (let i = 0; i < arg; i++) { const k = cborValue(st); out[k] = cborValue(st); } return out; }
    case 6: return cborValue(st); // tagged value (e.g. CID link) — return the inner value untouched
    default: throw new Error("unsupported CBOR major type " + majorType);
  }
}

// Advances st.pos past one CBOR value without building it — no TextDecoder
// calls, no array/object allocation. Used to walk past a record's fields
// once peekType (below) has already decided the record isn't wanted, so a
// giant irrelevant record costs a cheap byte-walk instead of a full decode.
function cborSkip(st: CborState): void {
  const bytes = st.bytes;
  const initial = bytes[st.pos++];
  const majorType = initial >> 5;
  const info = initial & 0x1f;

  if (majorType === 7) {
    if (info === 25) st.pos += 2;
    else if (info === 26) st.pos += 4;
    else if (info === 27) st.pos += 8;
    return;
  }

  const arg = cborArg(st, info);
  switch (majorType) {
    case 0: case 1: return; // arg already consumed the int's own bytes
    case 2: case 3: st.pos += arg; return; // bytes/text: skip the payload
    case 4: for (let i = 0; i < arg; i++) cborSkip(st); return;
    case 5: for (let i = 0; i < arg; i++) { cborSkip(st); cborSkip(st); } return; // skip key, skip value
    case 6: cborSkip(st); return;
    default: throw new Error("unsupported CBOR major type " + majorType);
  }
}

// Cheaply reads just a record block's "$type" field — decoding each key as
// it's encountered but skipping (not decoding) every value that isn't
// "$type" — instead of the full cborDecode every block used to pay for
// regardless of whether the record turned out to matter. Benchmarked
// against a 42k-block/10.6MB repo: full-decoding every block costs ~4us
// each; this costs ~0.8us for a block it ends up skipping, a ~5x saving
// this site now spends on scanning further into the repo rather than
// leaving on the table. Returns null for anything that isn't a top-level
// map or that has no "$type" key (both cheap early-outs).
function peekType(bytes: Uint8Array): string | null {
  const st: CborState = { bytes, pos: 0 };
  const initial = bytes[st.pos++];
  const majorType = initial >> 5;
  if (majorType !== 5) return null;
  const info = initial & 0x1f;
  const n = cborArg(st, info);
  for (let i = 0; i < n; i++) {
    const key = cborValue(st);
    if (key === "$type") {
      const val = cborValue(st);
      return typeof val === "string" ? val : null;
    }
    cborSkip(st);
  }
  return null;
}

// The whole collection sweep this site cares about — every lexicon a
// "thrashing" account's repo would touch. $type on a decoded record body
// already equals its collection nsid, so bucketing by $type after a flat
// block scan needs no MST walk (no rkeys needed, just record bodies).
const WANTED_TYPES = [
  "app.bsky.feed.post",
  "app.bsky.feed.like",
  "app.bsky.feed.repost",
  "app.bsky.graph.follow",
  "app.bsky.graph.block",
  "app.bsky.graph.listitem",
  "app.bsky.graph.list",
  "app.bsky.graph.starterpack",
  "app.bsky.feed.generator",
  "app.bsky.feed.threadgate",
  "app.bsky.feed.postgate",
];

// Deliberately block *count* caps, not a wall-clock deadline: Workers
// freezes Date.now() for the duration of a synchronous span (only advances
// it after a real I/O yield, as a Spectre-timing mitigation), so a tight
// decode loop would never see its own deadline pass — see sites/intrigue's
// identical comment on its own CAR_MAX_BLOCKS for the fuller writeup and the
// ~100ms-per-7MB-repo measurement the original single cap was sized against.
//
// Two tiers, not one, because a single "blocks visited" cap turned out to
// pick its sample almost entirely by luck of CAR block order rather than by
// relevance. Caught 2026-08-09 on @fromthewestmeadow.com's own repo (the
// account that asked for this site) after a mutual pointed out they scored
// suspiciously low: their repo interleaves ~17.5k records from an unrelated
// non-bsky collection ahead of most of their 5,928 real posts in CAR block
// order, so the old 6,000-block cap spent its entire budget decoding that
// junk and came away with 39 sampled posts and zero follows/blocks/likes
// worth mentioning — a wildly unrepresentative slice that scored them as
// the calmest account on the whole leaderboard.
//
// The fix: peekType (above) reads a block's "$type" for ~5x less than a
// full cborDecode (benchmarked against that same repo: ~0.8us/block to peek
// and skip vs. ~4us/block to fully decode), so CAR_MAX_BLOCKS_SCANNED can
// walk much further into the repo hunting for wanted records, while the
// decode budgets below keep the expensive part — actually building
// wanted-type objects — bounded close to what the original single cap
// intended. Re-run against that repo and four others off the live
// leaderboard: typical (non-pathological) accounts finish long before
// either cap and score identically to before; @fromthewestmeadow.com's own
// re-derived score moved from 60 to 91, in line with what an uncapped scan
// of their full repo actually gives (92). A repo that still exhausts both
// caps gets a real, honestly-partial prefix — not literally every record —
// while the client (no CPU-time limit at all; see public/lib/car.js)
// always reads the true whole repo. Intentional asymmetry: the server's
// job is independently re-deriving a real number from real repo bytes as
// an anti-cheat check, not reproducing the client's exact count.
//
// Raised 2026-08-09 from 30,000 to 600,000: @catblanketflower.yuwakisa.com's
// 74.2MiB repo (see CAR_MAX_BYTES above) has 257,257 dag-cbor blocks, comfortably
// over the old cap — a full unclipped scan+decode of it benchmarks at ~340ms,
// so 600,000 leaves headroom for a repo up to the new byte cap without ever
// being the thing that truncates a scan short of the file's end. peekType
// being ~5x cheaper than a full decode is what makes this affordable.
const CAR_MAX_BLOCKS_SCANNED = 600_000;

// Per-type decode budgets, not one shared "other" bucket. The previous fix
// (2026-08-09, see git history) split posts from everything-else because a
// post-heavy repo could burn a single shared budget before reaching blocks/
// likes/etc. later in CAR order. That fix was incomplete: "everything-else"
// is itself multiple collections of wildly different volume — likes usually
// outnumber blocks/follows/lists by 10-100x — so a shared other-budget just
// moved the same starvation problem one level down. Confirmed against
// @catblanketflower.yuwakisa.com's repo (168k likes vs. 1,644 blocks): a
// shared 3,000-record other-budget filled almost entirely with likes and
// left only 3 blocks decoded even with the full 257k-block scan above, while
// giving every wanted type its own budget correctly captures all 1,644.
// Each non-post type gets its own counter in otherDecoded below rather than
// its own named constant, since the set of "other" types is WANTED_TYPES
// minus POST_TYPE, not a fixed handful.
const CAR_MAX_POST_RECORDS_DECODED = 5_000;
const CAR_MAX_OTHER_RECORDS_DECODED_PER_TYPE = 2_000;
const POST_TYPE = "app.bsky.feed.post";

async function fetchRepoRecords(pds: string, did: string): Promise<{ byType: Record<string, any[]>; topchickenCount: number }> {
  const res = await fetch(pds.replace(/\/$/, "") + "/xrpc/com.atproto.sync.getRepo?did=" + encodeURIComponent(did));
  if (!res.ok) throw new Error(`getRepo ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > CAR_MAX_BYTES) throw new Error("repo CAR too large");

  const bytes = new Uint8Array(buf);
  const wanted = new Set(WANTED_TYPES);
  const byType: Record<string, any[]> = {};
  let scanned = 0;
  let decodedPosts = 0;
  const decodedOther: Record<string, number> = {};
  // Tallied off peekType's already-cheap read of every scanned block's
  // $type, whether or not that type is in WANTED_TYPES — shimmermathlabs.com
  // ruled (2026-08-09) that anyone with "topchicken records" (the unrelated
  // non-bsky collection that used to tank fromthewestmeadow's score, see
  // CAR_MAX_BLOCKS_SCANNED's comment above) deserves bonus points for it, so
  // this is now a real signal in computeThrash rather than junk to skip past.
  let topchickenCount = 0;
  for (const blockBytes of carBlocks(bytes)) {
    if (++scanned > CAR_MAX_BLOCKS_SCANNED) break;
    let type: string | null;
    try { type = peekType(blockBytes); } catch { continue; }
    if (type && /topchicken/i.test(type)) topchickenCount++;
    if (!type || !wanted.has(type)) continue;
    if (type === POST_TYPE) {
      if (++decodedPosts > CAR_MAX_POST_RECORDS_DECODED) continue;
    } else {
      const count = (decodedOther[type] || 0) + 1;
      decodedOther[type] = count;
      if (count > CAR_MAX_OTHER_RECORDS_DECODED_PER_TYPE) continue;
    }
    let obj: any;
    try { obj = cborDecode(blockBytes); } catch { continue; }
    (byType[obj.$type] || (byType[obj.$type] = [])).push(obj);
  }
  return { byType, topchickenCount };
}

// --- thrashing signals (kept in lockstep with public/index.html's copy) ---

interface Signal {
  label: string;
  pts: number;
  detail: string | null;
}

function computeThrash(did: string, profile: any, byType: Record<string, any[]>, topchickenCount: number): { score: number; signals: Signal[]; sampled: number } {
  const signals: Signal[] = [];
  let points = 0;
  const add = (label: string, pts: number, detail: string | null = null) => {
    if (!pts) return;
    points += pts;
    signals.push({ label, pts, detail });
  };

  const posts = byType["app.bsky.feed.post"] || [];
  const likes = byType["app.bsky.feed.like"] || [];
  const reposts = byType["app.bsky.feed.repost"] || [];
  const follows = byType["app.bsky.graph.follow"] || [];
  const blocks = byType["app.bsky.graph.block"] || [];
  const listitems = byType["app.bsky.graph.listitem"] || [];
  const lists = byType["app.bsky.graph.list"] || [];
  const starterpacks = byType["app.bsky.graph.starterpack"] || [];
  const feedgens = byType["app.bsky.feed.generator"] || [];
  const threadgates = byType["app.bsky.feed.threadgate"] || [];
  const postgates = byType["app.bsky.feed.postgate"] || [];

  const own = posts.length;
  const times: number[] = [];
  let replies = 0;
  let selfReplies = 0;
  let quotes = 0;

  for (const p of posts) {
    const t = Date.parse(p.createdAt || "");
    if (Number.isFinite(t)) times.push(t);
    if (p.reply && p.reply.parent && p.reply.parent.uri) {
      replies++;
      if (authorFromUri(p.reply.parent.uri) === did) selfReplies++;
    }
    const embedType = (p.embed && p.embed.$type) || "";
    if (embedType === "app.bsky.embed.record" || embedType === "app.bsky.embed.recordWithMedia") quotes++;
  }
  times.sort((a, b) => a - b);

  if (own === 0) return { score: 0, signals: [], sampled: 0 };

  // rapid-fire bursts: the most posts crammed into any single 10-minute window
  let maxBurst = 1;
  {
    let i = 0;
    for (let j = 0; j < times.length; j++) {
      while (times[j] - times[i] > 10 * 60 * 1000) i++;
      maxBurst = Math.max(maxBurst, j - i + 1);
    }
  }
  if (maxBurst >= 4) add("rapid-fire bursts", Math.min((maxBurst - 3) * 3, 20), `${maxBurst} posts inside a single 10-minute window`);

  // erratic rhythm: coefficient of variation across the gaps between posts
  if (times.length >= 8) {
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (mean > 0) {
      const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv >= 1.5) add("erratic rhythm", Math.min(Math.round((cv - 1) * 6), 18), `posting gaps swing wildly, no steady pace (cv ${cv.toFixed(1)})`);
    }
  }

  const replyRate = replies / own;
  if (replyRate >= 0.15) add("lives in other people's replies", Math.min(Math.round(replyRate * 22), 18), `${Math.round(replyRate * 100)}% of posts are replies`);

  if (selfReplies >= 3) add("argues with themselves", Math.min(selfReplies * 2, 14), `${selfReplies} self-replies`);

  if (quotes >= 2) add("quote-dunks", Math.min(quotes * 2, 12), `${quotes} quote posts`);

  if (blocks.length >= 3) add("trigger-happy with the block button", Math.min(blocks.length, 16), `${blocks.length} blocks on record`);

  const sprawl = [likes, reposts, follows, blocks, listitems, lists, starterpacks, feedgens, threadgates, postgates];
  const touched = sprawl.filter((arr) => arr.length > 0).length;
  if (touched >= 3) add("all over the protocol", Math.min((touched - 2) * 3, 15), `${touched} different record types besides posts`);

  // shimmermathlabs.com's ruling, 2026-08-09: "anyone with 'topchicken
  // records' deserves to have extra points in their score." Not a bug fix —
  // the people asked for a bonus, so it's a bonus.
  if (topchickenCount > 0) add("caught with topchicken records", Math.min(Math.ceil(topchickenCount / 500), 15), `${topchickenCount} topchicken records in the repo — shimmermathlabs said that's worth bonus points`);

  let nightCount = 0;
  for (const t of times) { const h = new Date(t).getUTCHours(); if (h >= 3 && h < 7) nightCount++; }
  const nightRate = nightCount / own;
  if (nightRate >= 0.2 && own >= 10) add("posts through the witching hours", Math.min(Math.round(nightRate * 30), 14), `${Math.round(nightRate * 100)}% of posts land 3–7am UTC`);

  if (typeof profile.createdAt === "string") {
    const ageDays = Math.max((Date.now() - Date.parse(profile.createdAt)) / 86400000, 1);
    // postsCount/followsCount come straight off the profile (an AppView
    // aggregate, exact regardless of any CAR scan cap) — take the max of
    // that and the sampled count so a repo that outran the scan caps above
    // doesn't silently understate a prolific account's real posting rate.
    // likes/reposts/blocks/listitems have no such exact aggregate, so those
    // stay sample-only.
    const totalRecords =
      Math.max(own, typeof profile.postsCount === "number" ? profile.postsCount : 0) +
      likes.length +
      reposts.length +
      Math.max(follows.length, typeof profile.followsCount === "number" ? profile.followsCount : 0) +
      blocks.length +
      listitems.length;
    const perDay = totalRecords / ageDays;
    if (perDay >= 8 && ageDays >= 3) add("posting like the servers are on fire", Math.min(Math.round(perDay), 20), `~${perDay.toFixed(1)} records/day since joining`);
  }

  const raw = Math.max(points, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-raw / 50)))));
  return { score, signals: signals.sort((a, b) => b.pts - a.pts), sampled: own };
}

async function fetchThrashData(did: string): Promise<{ byType: Record<string, any[]>; full: boolean; topchickenCount: number }> {
  const pds = await resolvePds(did);
  if (pds) {
    try {
      const { byType, topchickenCount } = await fetchRepoRecords(pds, did);
      return { byType, full: true, topchickenCount };
    } catch {
      // fall through
    }
  }
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "50" });
  const posts = ((feed.feed || []) as any[])
    .filter((item) => !item.reason && item.post && item.post.author && item.post.author.did === did)
    .map((item) => item.post.record || {});
  return { byType: { "app.bsky.feed.post": posts }, full: false, topchickenCount: 0 };
}

async function computeScore(did: string): Promise<{ profile: any; score: number; signals: Signal[]; sampled: number }> {
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  const { byType, topchickenCount } = await fetchThrashData(did);
  const { score, signals, sampled } = computeThrash(did, profile, byType, topchickenCount);
  return { profile, score, signals, sampled };
}

// Kept in lockstep with public/index.html's copy — only used here to word
// the personalized og:description below, the client owns the on-page tier.
function tierFor(score: number): { label: string; blurb: string } {
  if (score >= 90) return { label: "full mosh pit", blurb: "the timeline is a blast radius" };
  if (score >= 75) return { label: "properly thrashing", blurb: "energy of someone circling the pit" };
  if (score >= 55) return { label: "elbows out", blurb: "kicks up dust now and then" };
  if (score >= 35) return { label: "a little jumpy", blurb: "the occasional shove" };
  if (score >= 15) return { label: "mostly stationary", blurb: "barely swaying" };
  return { label: "glacial", blurb: "hasn't moved in weeks" };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanHandleOrDid(raw: string): string {
  let h = decodeURIComponent(raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

// The static page's title/description/url are each one identical string
// repeated across <title>/og:*/twitter:* — a plain split-join replace-all
// per field is enough to personalize the whole head, no HTML parser needed.
const GENERIC_TITLE = "thrashmeter — how hard is this Bluesky account thrashing?";
const GENERIC_DESC =
  "Enter a Bluesky handle and get a thrashing score out of 100, read off their entire repo via a full CAR download: rapid-fire posting bursts, erratic rhythm, reply-diving, self-reply spirals, quote-dunking, block rate, and how many corners of the protocol they touch. Joins a shared leaderboard, verified server-side.";
const GENERIC_OG_URL = "https://thrashmeter.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandleOrDid(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
    if (typeof did !== "string" || !did.startsWith("did:")) throw new Error("bad did");

    const { profile, score, signals } = await computeScore(did);
    const tier = tierFor(score);
    const top = signals[0];

    const who = "@" + (profile.handle || handle);
    const title = `thrashmeter: ${who} scores ${score}/100 — ${tier.label}`;
    const topBit = top ? ` Top signal: ${top.label} (+${top.pts}).` : "";
    const desc = truncate(`${tier.blurb}.${topBit} Score your own at thrashmeter.bisks.net.`, 300);
    const ogUrl = `https://thrashmeter.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch {
    // Couldn't resolve/score the handle server-side (typo, deleted account,
    // PDS down, CAR too big) — still serve the live page so the link isn't
    // dead; the client script re-runs the scan itself and surfaces its own
    // error if the handle really is bad.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

interface UserRecord {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  score: number;
  topSignals: Signal[];
  sampled: number;
  updatedAt: number;
}

const LEADERBOARD_SIZE = 100;
const RESCORE_COOLDOWN_MS = 30_000;

// Bump whenever computeThrash's rules change enough that stored scores are
// stale, not just newly-submitted ones — e.g. the topchicken bonus added
// 2026-08-09 per shimmermathlabs.com's request. maybeRerankAll() walks every
// stored record once, the first time /api/leaderboard is hit after a bump,
// and re-derives its score under the current rules; the version marker
// keeps that a one-time cost rather than a re-scan on every page load.
const RULES_VERSION = 2;

// Holds one UserRecord per DID that's ever been scored, under "user:<did>".
// A submit re-derives the score from the account's repo every time (activity
// changes), unless it was just scored within the cooldown window, in which
// case the cached record is returned as-is so an accidental double-submit
// doesn't hammer the PDS.
export class Thrashboard {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  // Re-derives every stored user's score under the current rules, once per
  // RULES_VERSION bump. A single stale/unreachable account (deleted, PDS
  // down) is skipped, not fatal to the rest of the rerank — it just keeps
  // its old score until the next successful pass.
  private async maybeRerankAll(): Promise<void> {
    const version = await this.state.storage.get<number>("meta:rulesVersion");
    if (version === RULES_VERSION) return;

    const users = await this.state.storage.list<UserRecord>({ prefix: "user:" });
    for (const [key, record] of users) {
      try {
        const result = await computeScore(record.did);
        const updated: UserRecord = {
          ...record,
          handle: result.profile.handle || record.handle,
          displayName: result.profile.displayName || record.displayName,
          avatar: result.profile.avatar || record.avatar,
          score: result.score,
          topSignals: result.signals.slice(0, 6),
          sampled: result.sampled,
          updatedAt: Date.now(),
        };
        await this.state.storage.put({ [key]: updated });
      } catch {
        // leave the stale record as-is — one bad rescan shouldn't block the rest
      }
    }
    await this.state.storage.put({ "meta:rulesVersion": RULES_VERSION });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      await this.maybeRerankAll();
      const users = await this.state.storage.list<UserRecord>({ prefix: "user:" });
      const all = [...users.values()];
      const board = all
        .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
        .slice(0, LEADERBOARD_SIZE)
        .map((r) => ({
          did: r.did,
          handle: r.handle,
          displayName: r.displayName,
          avatar: r.avatar,
          score: r.score,
          topSignals: r.topSignals,
        }));
      return json({ board, scored: all.length });
    }

    if (url.pathname === "/api/submit" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const handleOrDid = typeof body?.handle === "string" ? body.handle.trim() : "";
      if (!handleOrDid) return json({ error: "missing handle" }, 400);

      let did: string;
      try {
        did = handleOrDid.startsWith("did:") ? handleOrDid : (await xrpc("com.atproto.identity.resolveHandle", { handle: handleOrDid })).did;
      } catch {
        return json({ error: "couldn't resolve that handle" }, 400);
      }
      if (typeof did !== "string" || !did.startsWith("did:")) return json({ error: "couldn't resolve that handle" }, 400);

      const key = `user:${did}`;
      const existing = await this.state.storage.get<UserRecord>(key);
      if (existing && Date.now() - existing.updatedAt < RESCORE_COOLDOWN_MS) {
        return json({ did, handle: existing.handle, score: existing.score, signals: existing.topSignals, sampled: existing.sampled, cached: true });
      }

      let result;
      try {
        result = await computeScore(did);
      } catch {
        return json({ error: "couldn't reach the appview/PDS to score that account" }, 502);
      }

      const record: UserRecord = {
        did,
        handle: result.profile.handle || handleOrDid,
        displayName: result.profile.displayName || undefined,
        avatar: result.profile.avatar || undefined,
        score: result.score,
        topSignals: result.signals.slice(0, 6),
        sampled: result.sampled,
        updatedAt: Date.now(),
      };
      await this.state.storage.put({ [key]: record });

      return json({ did, handle: record.handle, score: record.score, signals: result.signals, sampled: result.sampled, cached: false });
    }

    return json({ error: "not found" }, 404);
  }
}

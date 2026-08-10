// thrashradar Worker — thrashradar.bisks.net
//
// A fork of sites/thrashmeter (same requester, @fromthewestmeadow.com):
// "the same thrashing score, but the leaderboard fills itself from the
// firehose instead of only from handles someone searches." The scoring rules
// (computeThrash, the CAR/DAG-CBOR parser, fetchRepoRecords, computeScore)
// are copied VERBATIM from sites/thrashmeter/src/index.ts — same method, same
// per-type decode budgets, same everything — because the ask was specifically
// "using the same scoring method." Manual search still works exactly like
// thrashmeter (public/index.html), and now feeds the same leaderboard a
// second, passive source does.
//
// The new part is discovery. A Durable Object holds one persistent outbound
// WebSocket to Jetstream (the sites/ratioed/sites/didrank pattern: fetch()
// with an Upgrade header, not `new WebSocket(url)`), subscribed to JUST
// app.bsky.feed.post — not the full 11-collection WANTED_TYPES set
// computeThrash itself reads, because likes alone are ~70% of firehose volume
// (see notes/ideas/store-ours-rederive-theirs.md's live measurement) and this
// only needs a cheap discovery signal, not the real scoring data. It keeps a
// small in-memory map of each DID's post timestamps over a rolling 10-minute
// window — mirroring computeThrash's own "rapid-fire bursts" threshold (4+
// posts in 10 minutes) — and once a DID crosses that bar it's queued as a
// candidate.
//
// Critically: that map is BOUNDED and IN-MEMORY ONLY, never written to
// storage. notes/ideas/store-ours-rederive-theirs.md settled this after an
// earlier "build a persistent firehose index" thread turned out to be wrong:
// "store what's ours, re-derive the rest." So the firehose here is only ever
// used to pick *who* to look at; the actual look is the same full-repo CAR
// re-derivation computeScore already does for a manual search. The alarm tick
// pulls at most one due candidate off the queue per ~20s and re-scores it for
// real — about one CAR fetch a tick, gentle on PDSs, which is the "if that's
// not too intense" the ask flagged. Only the derived score (our own work
// product, same shape thrashmeter already persists) goes into DO storage.

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
  setAlarm(time: number | Date): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/leaderboard" || url.pathname === "/api/submit") {
      const id = env.BOARD.idFromName("global");
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }
    // /s/<handle> — a distinct, shareable, per-person URL, same pattern as
    // sites/thrashmeter/src/index.ts (which this is ported from) and
    // sites/didscope's renderShare before that. See
    // notes/45-sharing-and-virality.md.
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

// --- PDS resolution + CAR/DAG-CBOR parsing — copied unmodified from
// sites/thrashmeter/src/index.ts (itself ported from public/lib/car.js and
// public/lib/identity.js; see those files for the fuller writeup) ---

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
// oversized repo eat unbounded memory/download time. Kept at thrashmeter's
// current cap — see that file's header comment for the incident that sized
// it (a confirmed real 74.2MiB/257k-block repo).
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

// The whole collection sweep computeThrash cares about — kept identical to
// thrashmeter's set. This is the REAL scoring data, fetched fresh per account
// from its own repo CAR; unrelated to the narrower single-collection Jetstream
// subscription the discovery DO uses below to pick *who* to score.
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

// Same two-tier block-count/decode-budget caps as thrashmeter — see that
// file's header comment for the full history of why they're shaped this way.
const CAR_MAX_BLOCKS_SCANNED = 600_000;
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

// --- thrashing signals — copied verbatim from sites/thrashmeter/src/index.ts
// (kept in lockstep with that file, and with public/index.html's own copy
// here) so this is genuinely "the same scoring method," per the ask. ---

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

  if (topchickenCount > 0) add("caught with topchicken records", Math.min(Math.ceil(topchickenCount / 500), 15), `${topchickenCount} topchicken records in the repo — shimmermathlabs said that's worth bonus points`);

  let nightCount = 0;
  for (const t of times) { const h = new Date(t).getUTCHours(); if (h >= 3 && h < 7) nightCount++; }
  const nightRate = nightCount / own;
  if (nightRate >= 0.2 && own >= 10) add("posts through the witching hours", Math.min(Math.round(nightRate * 30), 14), `${Math.round(nightRate * 100)}% of posts land 3–7am UTC`);

  if (typeof profile.createdAt === "string") {
    const ageDays = Math.max((Date.now() - Date.parse(profile.createdAt)) / 86400000, 1);
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

const GENERIC_TITLE = "thrashradar — the Bluesky thrash leaderboard that finds itself";
const GENERIC_DESC =
  "Watches the live firehose for bursty, chaotic posting and quietly re-scores whoever it spots — full CAR download, same rules as thrashmeter: rapid-fire bursts, erratic rhythm, reply-diving, self-reply spirals, quote-dunking, block rate, protocol sprawl. Search a handle too; either way the leaderboard is real, re-derived server-side.";
const GENERIC_OG_URL = "https://thrashradar.bisks.net/";

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

    const realHandle = profile.handle && profile.handle !== "handle.invalid" ? profile.handle : null;
    const who = realHandle ? "@" + realHandle : did;
    const title = `thrashradar: ${who} scores ${score}/100 — ${tier.label}`;
    const topBit = top ? ` Top signal: ${top.label} (+${top.pts}).` : "";
    const desc = truncate(`${tier.blurb}.${topBit} Score your own at thrashradar.bisks.net.`, 300);
    const ogUrl = `https://thrashradar.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch {
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
  source: "search" | "firehose";
  updatedAt: number;
}

const LEADERBOARD_SIZE = 100;
const RESCORE_COOLDOWN_MS = 30_000; // guards an accidental double manual-submit
const DISCOVERY_COOLDOWN_MS = 3 * 60 * 60 * 1000; // don't re-CAR-fetch a bursty account more than once per ~3h

const RULES_VERSION = 2; // matches thrashmeter's — same computeThrash, same version marker convention

// ---- firehose discovery config ---------------------------------------------
// Deliberately narrow: only the collection this needs for a cheap "is this
// account bursting right now" signal, not the full WANTED_TYPES set
// computeThrash reads (that's fetched fresh per-candidate off their own repo
// instead — see the file header comment).
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const DISCOVERY_WINDOW_MS = 10 * 60 * 1000; // same 10-minute window computeThrash's own burst signal uses
const DISCOVERY_BURST_THRESHOLD = 4; // same floor as computeThrash's "rapid-fire bursts" (maxBurst >= 4)
const TRACK_MAX_DIDS = 5000; // bound on the in-memory tracking map — never persisted, see header comment
const DISCOVERY_QUEUE_MAX = 300;
const ALARM_MS = 20 * 1000; // tick cadence — also the reconnect heartbeat and CAR-fetch throttle
const MAX_DISCOVERY_SCORES_PER_TICK = 1; // about one CAR fetch per ~20s — gentle on PDSs

// Holds one UserRecord per DID that's ever been scored, under "user:<did>" —
// identical storage shape to sites/thrashmeter's Thrashboard, plus a `source`
// field so the UI can show whether an entry was found by search or spotted
// live. A submit (manual or discovery) re-derives the score from the
// account's repo every time, unless it was just scored within its cooldown.
export class ThrashRadar {
  private state: DurableObjectState;
  private ready: Promise<void>;

  // ---- discovery state: bounded, in-memory, never persisted (see header) --
  private postTimes: Map<string, number[]> = new Map();
  private queued: Set<string> = new Set();
  private discoveryQueue: string[] = [];
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {});
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose (discovery only — see header comment) -----------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade header
  // (the documented Cloudflare pattern), not the browser-style
  // `new WebSocket(url)` constructor — same as sites/ratioed and sites/didrank.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        try {
          this.handleMessage(String(ev.data));
        } catch {
          // one bad message shouldn't kill the stream
        }
      });
      ws.addEventListener("close", () => {
        if (this.ws === ws) this.ws = null;
        this.scheduleReconnect();
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          // already closing
        }
      });
    } catch {
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    setTimeout(() => {
      this.connectSocket().catch(() => {});
    }, delay);
  }

  private wsOpen(): boolean {
    return !!this.ws && this.ws.readyState === 1; // WebSocket.OPEN
  }

  private handleMessage(raw: string): void {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    if (!commit || commit.operation !== "create") return;
    if (commit.collection && commit.collection !== "app.bsky.feed.post") return;
    const did = evt.did;
    if (typeof did !== "string" || !did) return;

    const now = Date.now();
    let times = this.postTimes.get(did);
    if (!times) {
      if (this.postTimes.size >= TRACK_MAX_DIDS) return; // tracking map is full — drop, don't grow unbounded
      times = [];
      this.postTimes.set(did, times);
    }
    times.push(now);
    // trim to the rolling window as we go, so a single hot DID's array can't grow unbounded either
    while (times.length && now - times[0] > DISCOVERY_WINDOW_MS) times.shift();

    if (times.length < DISCOVERY_BURST_THRESHOLD) return;
    if (this.queued.has(did)) return; // already waiting to be (re)scored
    if (this.discoveryQueue.length >= DISCOVERY_QUEUE_MAX) return; // backlog full — drop, don't grow unbounded

    this.discoveryQueue.push(did);
    this.queued.add(did);
  }

  // ---- alarm: reconnect heartbeat + discovery throttle + eviction ---------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    // Evict tracking entries that have fully aged out of the window — bounds
    // the in-memory map even for DIDs that posted just once and never came back.
    for (const [did, times] of this.postTimes) {
      while (times.length && now - times[0] > DISCOVERY_WINDOW_MS) times.shift();
      if (!times.length) this.postTimes.delete(did);
    }

    let scoredThisTick = 0;
    while (scoredThisTick < MAX_DISCOVERY_SCORES_PER_TICK && this.discoveryQueue.length) {
      const did = this.discoveryQueue.shift() as string;
      this.queued.delete(did);
      const key = `user:${did}`;
      const existing = await this.state.storage.get<UserRecord>(key);
      if (existing && now - existing.updatedAt < DISCOVERY_COOLDOWN_MS) continue; // recently scored — skip, don't burn a CAR fetch
      scoredThisTick++;
      try {
        const result = await computeScore(did);
        const record: UserRecord = {
          did,
          handle: result.profile.handle || did,
          displayName: result.profile.displayName || undefined,
          avatar: result.profile.avatar || undefined,
          score: result.score,
          topSignals: result.signals.slice(0, 6),
          sampled: result.sampled,
          source: existing ? existing.source : "firehose",
          updatedAt: now,
        };
        await this.state.storage.put({ [key]: record });
      } catch {
        // a bad PDS/appview lookup shouldn't stall the queue — just move on
      }
    }

    await this.state.storage.setAlarm(now + ALARM_MS);
  }

  // Re-derives every stored user's score under the current rules, once per
  // RULES_VERSION bump — same convention as thrashmeter's Thrashboard.
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
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

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
          source: r.source,
        }));
      const firehoseCount = all.filter((r) => r.source === "firehose").length;
      return json({
        board,
        scored: all.length,
        firehoseFound: firehoseCount,
        searchFound: all.length - firehoseCount,
        watching: this.postTimes.size,
        queued: this.discoveryQueue.length,
      });
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
        source: existing ? existing.source : "search",
        updatedAt: Date.now(),
      };
      await this.state.storage.put({ [key]: record });

      return json({ did, handle: record.handle, score: record.score, signals: result.signals, sampled: result.sampled, cached: false });
    }

    return json({ error: "not found" }, 404);
  }
}

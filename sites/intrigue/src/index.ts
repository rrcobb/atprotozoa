// intrigue Worker — intrigue.bisks.net
//
// Enter a Bluesky handle, get an "interestingness" score out of 100. The
// score itself is computed twice, independently, from the exact same rules:
//
//   - public/index.html computes it client-side (a profile fetch plus the
//     account's *entire* repo, downloaded as one CAR straight off its own
//     PDS via com.atproto.sync.getRepo — see public/lib/car.js) for instant
//     feedback.
//   - This file computes it again, server-side in the Board Durable Object,
//     from nothing but the handle the client sends — it re-resolves the PDS
//     and re-downloads the same CAR itself and recomputes from scratch. The
//     client's own number is never trusted or stored; only what the server
//     independently derives goes on the leaderboard. See sites/peakposting
//     for the sibling pattern (verify by re-fetching, not by trusting).
//
// Originally this only looked at one page of app.bsky.feed.getAuthorFeed
// (50 posts). @fromthewestmeadow.com asked, in reply to the post that
// commissioned this site, to "download the whole car so you see all their
// posts" — i.e. pull the full repo CAR instead of a capped recent sample,
// same trick sites/cloutgraph and sites/beefcheck use. That's now the
// primary path on both sides; getAuthorFeed only kicks in as a fallback if
// the PDS can't be resolved or the CAR fetch/parse fails.
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
// oversized repo eat unbounded memory/download time.
const CAR_MAX_BYTES = 64 * 1024 * 1024;
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
// lives in fetchRepoPosts below, not here, because it's a Worker-only
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

// Downloads `pds`'s repo CAR for `did` and returns every record whose $type
// matches `type`. Throws on network/oversize/over-budget failure; caller
// falls back to getAuthorFeed.
// Measured on a ~7 MB / 26k-block repo: decoding every dag-cbor block costs
// well over 100ms of real CPU time, and Workers Free plan only budgets
// ~10ms CPU per request (this account is on Free — see notes/20-deploy.md).
// A CPU-limit-exceeded kill isn't a catchable JS error, so this needs a hard
// ceiling on work done, not just a try/catch. Deliberately a block *count*
// cap, not a wall-clock deadline: Workers freezes Date.now() for the
// duration of a synchronous span (only advances it after a real I/O yield,
// as a Spectre-timing mitigation), so a tight decode loop would never see
// its own deadline pass and the check would be a no-op in production even
// though it "worked" against local wrangler dev's plain-Node clock.
//
// A repo bigger than this cap gets a real, honestly-partial prefix scanned
// — not literally every post — while the client (no CPU-time limit at all;
// see public/lib/car.js) always reads the true whole repo. That's an
// intentional asymmetry: the server's job is independently re-deriving a
// real number from real repo bytes as an anti-cheat check, not reproducing
// the client's exact count. Still a large jump from the 50-post sample this
// replaced for the overwhelming majority of accounts, which don't come
// anywhere near this cap.
const CAR_MAX_BLOCKS = 6_000;

async function fetchRepoPosts(pds: string, did: string, type: string): Promise<any[]> {
  const res = await fetch(pds.replace(/\/$/, "") + "/xrpc/com.atproto.sync.getRepo?did=" + encodeURIComponent(did));
  if (!res.ok) throw new Error(`getRepo ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > CAR_MAX_BYTES) throw new Error("repo CAR too large");

  const bytes = new Uint8Array(buf);
  const out: any[] = [];
  let scanned = 0;
  for (const blockBytes of carBlocks(bytes)) {
    if (++scanned > CAR_MAX_BLOCKS) break;
    let obj: any;
    try { obj = cborDecode(blockBytes); } catch { continue; }
    if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.$type === type) out.push(obj);
  }
  return out;
}

// --- post normalization (kept in lockstep with public/index.html's copy) ---
// Squashes either a raw CAR record or a hydrated getAuthorFeed item into the
// same flat shape so scorePosts below doesn't need to know which it got.

interface NormalizedPost {
  text: string;
  langs: string[];
  isQuote: boolean;
  isExternal: boolean;
  replyIsSelf: boolean;
  totalImages: number;
  altImages: number;
}

function normalizeFromRecord(rec: any, did: string): NormalizedPost {
  const embed = rec.embed || {};
  const t = embed.$type || "";
  let images: any[] = [];
  if (t === "app.bsky.embed.images") images = embed.images || [];
  else if (t === "app.bsky.embed.recordWithMedia" && embed.media && embed.media.$type === "app.bsky.embed.images") images = embed.media.images || [];
  const parentDid = rec.reply && rec.reply.parent ? authorFromUri(rec.reply.parent.uri) : null;
  return {
    text: typeof rec.text === "string" ? rec.text : "",
    langs: Array.isArray(rec.langs) ? rec.langs : [],
    isQuote: t === "app.bsky.embed.record" || t === "app.bsky.embed.recordWithMedia",
    isExternal: t === "app.bsky.embed.external",
    replyIsSelf: !!rec.reply && parentDid === did,
    totalImages: images.length,
    altImages: images.filter((i: any) => i.alt && i.alt.trim().length > 0).length,
  };
}

function normalizeFromFeedItem(item: any, did: string): NormalizedPost | null {
  if (item.reason) return null; // a repost of someone else's post, not theirs
  const post = item.post;
  if (!post || !post.author || post.author.did !== did) return null;
  const rec = post.record || {};
  const embed = post.embed || {};
  const t = embed.$type || "";
  let totalImages = 0, altImages = 0;
  if (t === "app.bsky.embed.images#view" && Array.isArray(embed.images)) {
    totalImages = embed.images.length;
    altImages = embed.images.filter((i: any) => i.alt && i.alt.trim().length > 0).length;
  }
  const parentDid = item.reply?.parent?.author?.did;
  return {
    text: typeof rec.text === "string" ? rec.text : "",
    langs: Array.isArray(rec.langs) ? rec.langs : [],
    isQuote: t.includes("recordWithMedia") || t === "app.bsky.embed.record#view",
    isExternal: t === "app.bsky.embed.external#view",
    replyIsSelf: !!rec.reply && parentDid === did,
    totalImages,
    altImages,
  };
}

// Prefers the full repo CAR; falls back to a 50-post AppView sample only if
// the PDS can't be resolved or the CAR fetch/parse fails or blows its budget.
async function fetchAllPosts(did: string): Promise<{ posts: NormalizedPost[]; full: boolean }> {
  const pds = await resolvePds(did);
  if (pds) {
    try {
      const records = await fetchRepoPosts(pds, did, "app.bsky.feed.post");
      return { posts: records.map((r) => normalizeFromRecord(r, did)), full: true };
    } catch {
      // fall through
    }
  }
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "50" });
  const posts = ((feed.feed || []) as any[])
    .map((item) => normalizeFromFeedItem(item, did))
    .filter((p): p is NormalizedPost => p !== null);
  return { posts, full: false };
}

// --- scoring rules (kept in lockstep with public/index.html's copy) ---

const GENERIC_SUFFIXES = [".bsky.social", ".bsky.brid.gy", ".bsky.team"];
const fmt = (n: number) => n.toLocaleString();

interface Signal {
  label: string;
  pts: number;
  detail: string | null;
}

function isCustomDomain(handle: string): boolean {
  return !!handle && !GENERIC_SUFFIXES.some((s) => handle.endsWith(s));
}

function scoreProfile(profile: any): { points: number; signals: Signal[] } {
  const signals: Signal[] = [];
  let points = 0;
  const add = (label: string, pts: number, detail: string | null = null) => {
    if (!pts) return;
    points += pts;
    signals.push({ label, pts, detail });
  };

  const handle = profile.handle || "";
  if (isCustomDomain(handle)) add("custom domain handle", 8, `@${handle} isn't a *.bsky.social freebie`);

  const bio = (profile.description || "").trim();
  if (bio.length > 120) add("detailed bio", 8, `${bio.length} characters of self-summary`);
  else if (bio.length > 20) add("has a bio", 4);
  if (/https?:\/\//i.test(bio)) add("bio links out", 3, "points somewhere else on the internet");

  if (profile.avatar) add("has an avatar", 2);
  if (profile.banner) add("has a banner", 4, "bothered to set a banner image");
  if (profile.pinnedPost) add("pinned post", 5, "curates their own profile");

  const assoc = profile.associated || {};
  const lists = Number(assoc.lists || 0);
  const feedgens = Number(assoc.feedgens || 0);
  const packs = Number(assoc.starterPacks || 0);
  if (lists > 0) add(`made ${lists} list${lists === 1 ? "" : "s"}`, Math.min(lists * 3, 12));
  if (feedgens > 0)
    add(`runs ${feedgens} custom feed${feedgens === 1 ? "" : "s"}`, Math.min(feedgens * 12, 36), "writes their own ranking algorithm");
  if (packs > 0) add(`built ${packs} starter pack${packs === 1 ? "" : "s"}`, Math.min(packs * 6, 18));
  if (assoc.labeler) add("runs a labeler", 15, "moderates part of the network");

  const followers = Number(profile.followersCount || 0);
  const follows = Number(profile.followsCount || 0);
  if (followers >= 10000) add("real reach", 10, `${fmt(followers)} followers`);
  else if (followers >= 1000) add("solid following", 5, `${fmt(followers)} followers`);
  if (followers > 200 && followers / Math.max(follows, 1) >= 20) add("audience >> who they follow", 6, "broadcast energy");
  if (follows > 500 && follows / Math.max(followers, 1) >= 10) add("follows way more than follow them", 3, "here to read, not to be read");

  if (typeof profile.createdAt === "string") {
    const ageDays = (Date.now() - Date.parse(profile.createdAt)) / 86400000;
    if (Number.isFinite(ageDays) && ageDays > 900) add("early adopter", 8, `on Bluesky since ${profile.createdAt.slice(0, 10)}`);
    else if (Number.isFinite(ageDays) && ageDays > 365) add("been around a while", 3);
  }

  return { points, signals };
}

function scorePosts(posts: NormalizedPost[]): { points: number; signals: Signal[]; sampled: number } {
  const signals: Signal[] = [];
  let points = 0;
  const add = (label: string, pts: number, detail: string | null = null) => {
    if (!pts) return;
    points += pts;
    signals.push({ label, pts, detail });
  };

  const own = posts.length;
  let selfReplies = 0;
  let quotes = 0;
  let externalLinks = 0;
  let totalImages = 0;
  let altImages = 0;
  const langs = new Set<string>();
  const emojis = new Set<string>();
  const textSample: string[] = [];
  const seenText = new Map<string, number>();
  let dupes = 0;

  for (const post of posts) {
    for (const l of post.langs) langs.add(l);

    const text = post.text;
    if (text) {
      textSample.push(text);
      const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
      if (norm.length > 8) {
        const count = (seenText.get(norm) || 0) + 1;
        seenText.set(norm, count);
        if (count > 1) dupes++;
      }
      const found = text.match(/\p{Extended_Pictographic}/gu) || [];
      for (const e of found) emojis.add(e);
    }

    if (post.replyIsSelf) selfReplies++;
    if (post.isQuote) quotes++;
    if (post.isExternal) externalLinks++;
    totalImages += post.totalImages;
    altImages += post.altImages;
  }

  if (own === 0) return { points: 0, signals: [], sampled: 0 };

  if (langs.size >= 2) add(`posts in ${langs.size} languages`, Math.min((langs.size - 1) * 4, 12), [...langs].join(", "));

  if (totalImages > 0) {
    const altRate = altImages / totalImages;
    if (altRate >= 0.8) add("writes alt text", 10, "images are accessible");
    else if (altRate >= 0.3) add("sometimes writes alt text", 4);
  }

  if (quotes > 0) add("quote-posts", Math.min(quotes, 6), `${quotes} in the sample`);
  if (externalLinks > 0) add("shares links", Math.min(externalLinks, 5));
  if (selfReplies >= 3) add("builds threads", Math.min(selfReplies, 10), `${selfReplies} self-replies in the sample`);
  if (emojis.size >= 5) add("emoji range", Math.min(emojis.size - 4, 8), [...emojis].slice(0, 8).join(" "));

  const dupeRate = dupes / own;
  if (dupeRate >= 0.4 && own >= 10) add("repeats itself a lot", -15, `${Math.round(dupeRate * 100)}% near-duplicate posts`);

  const lens = textSample.map((t) => t.length).filter((n) => n > 0);
  if (lens.length >= 5 && Math.max(...lens) - Math.min(...lens) > 200) add("range from one-liners to essays", 4);

  return { points, signals, sampled: own };
}

function scoreAccount(profile: any, posts: NormalizedPost[]): { score: number; signals: Signal[]; sampled: number } {
  const p = scoreProfile(profile);
  const q = scorePosts(posts);
  const raw = p.points + q.points;
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-Math.max(raw, 0) / 55)))));
  return { score, signals: [...p.signals, ...q.signals].sort((a, b) => b.pts - a.pts), sampled: q.sampled };
}

async function computeScore(did: string): Promise<{ profile: any; score: number; signals: Signal[]; sampled: number }> {
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  const { posts } = await fetchAllPosts(did);
  const { score, signals, sampled } = scoreAccount(profile, posts);
  return { profile, score, signals, sampled };
}

// Kept in lockstep with public/index.html's copy — only used here to word
// the personalized og:description below, the client owns the on-page tier.
function tierFor(score: number): { label: string; blurb: string } {
  if (score >= 90) return { label: "certifiable main character", blurb: "the algorithm is speedrunning you into everyone's feed" };
  if (score >= 75) return { label: "genuinely intriguing", blurb: "there is a whole bit going on here" };
  if (score >= 55) return { label: "has layers", blurb: "worth a second scroll" };
  if (score >= 35) return { label: "quietly fine", blurb: "a normal, functioning account" };
  if (score >= 15) return { label: "lurking", blurb: "reading more than posting, probably" };
  return { label: "certified NPC", blurb: "blank bio, blank timeline" };
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
const GENERIC_TITLE = "intrigue — how interesting is this Bluesky account?";
const GENERIC_DESC =
  "Enter a Bluesky handle and get an interestingness score out of 100, built from real signals: custom feeds and lists you've made, alt text usage, language and emoji range, thread-building, and more. Joins a shared leaderboard, verified server-side.";
const GENERIC_OG_URL = "https://intrigue.bisks.net/";

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
    const title = `intrigue: ${who} scores ${score}/100 — ${tier.label}`;
    const topBit = top ? ` Top signal: ${top.label} (${top.pts >= 0 ? "+" : ""}${top.pts}).` : "";
    const desc = truncate(`${tier.blurb}.${topBit} Score your own at intrigue.bisks.net.`, 300);
    const ogUrl = `https://intrigue.bisks.net/s/${encodeURIComponent(handle)}`;

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

// Holds one UserRecord per DID that's ever been scored, under "user:<did>".
// A submit re-derives the score from the AppView every time (an account's
// interestingness can change), unless it was just scored within the
// cooldown window, in which case the cached record is returned as-is so an
// accidental double-submit doesn't hammer the AppView.
export class Board {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
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
        return json({ error: "couldn't reach the appview to score that account" }, 502);
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

// glazerank Worker — glazerank.bisks.net
//
// @mfzx.net asked (replying in a thread about @demigirlboss.bsky.social's
// bio joking she's "ATProto's 19th biggest glazer") for a site with an
// account input that computes an "atproto glazer" score 0-1000 off that
// account's own posts, going back as far as the site can fetch, plus a
// leaderboard.
//
// Scoring runs server-side (POST /api/score), not in the browser. Two
// reasons: (1) it downloads the account's whole repo as one CAR
// (com.atproto.sync.getRepo, no auth needed — see notes/40-new-site-playbook.md's
// cee.wtf thread on preferring bulk reads over paginated listRecords/
// getAuthorFeed walks) and (2) keeping the fetch+score server-side means the
// leaderboard reflects a score that actually came from that account's real
// posts, not whatever number a forged client POST body claims. The CAR
// parser below is copied from sites/backscroll's lib/car.js (itself copied
// from sites/beefcheck via sites/ngmi — "copy, don't abstract"), trimmed to
// the flat record scan this site needs (no rkey/permalink reconstruction).
//
// One KV blob holds the leaderboard: same single-snapshot-in-one-key pattern
// as sites/chickenjack's TABLE_STATE. It doubles as the cache /u/<handle>'s
// personalized OG unfurl reads from (sites/didscope's renderShare pattern) —
// a link preview never triggers a fresh multi-second CAR download, it just
// reads whatever score that account last posted to the leaderboard.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  LEADERBOARD: {
    get(key: string, type: "json"): Promise<any>;
    put(key: string, value: string): Promise<void>;
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---- CAR / DAG-CBOR parsing (copy of sites/backscroll/public/lib/car.js's
// fetchRepoRecordsWithKeys, trimmed: this site never needs a record's rkey,
// just its text, so the MST in-order walk below skips key reconstruction) ---

// A repo CAR for even a very prolific poster is almost entirely small text
// records (getRepo excludes blob bytes — images ride separately), so this
// is a genuine memory backstop for the Worker isolate (128MB), not reflexive
// caution: bail and fall back to the paginated feed walk rather than risk
// OOM-ing on a pathological repo.
const CAR_MAX_BYTES = 80 * 1024 * 1024;
const CID_LINK = Symbol("cidLink");

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let result = 0, shift = 0, b;
  do {
    b = bytes[offset++];
    result += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
  } while (b >= 0x80);
  return [result, offset];
}

function readCid(bytes: Uint8Array, offset: number): [string, number] {
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

function* carBlocksByCid(bytes: Uint8Array): Generator<{ cidKey: string; bytes: Uint8Array }> {
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

interface CborState {
  bytes: Uint8Array;
  pos: number;
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
    return hi * 4294967296 + lo;
  }
  throw new Error("unsupported CBOR length encoding " + info);
}

function cborValue(st: CborState, linkCids?: boolean): any {
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
    case 4: { const out: any[] = []; for (let i = 0; i < arg; i++) out.push(cborValue(st, linkCids)); return out; }
    case 5: { const out: Record<string, any> = {}; for (let i = 0; i < arg; i++) { const k = cborValue(st, linkCids); out[k] = cborValue(st, linkCids); } return out; }
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

function cborDecode(bytes: Uint8Array): any {
  return cborValue({ bytes, pos: 0 });
}

// Downloads `pds`'s repo CAR for `did` and walks its MST to pull out every
// record whose $type matches `wanted`, returning just the record bodies
// (this site never needs the rkey — a share link points at the handle, not
// an individual post). Throws on network/oversize/malformed-CAR failure;
// caller falls back to a paginated getAuthorFeed walk.
async function fetchRepoRecords(pds: string, did: string, wantedType: string): Promise<any[]> {
  const res = await fetch(pds.replace(/\/$/, "") + "/xrpc/com.atproto.sync.getRepo?did=" + encodeURIComponent(did));
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json() as any).message || msg; } catch (_) {}
    throw new Error("getRepo: " + msg);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > CAR_MAX_BYTES) throw new Error("repo CAR too large to parse");
  const bytes = new Uint8Array(buf);

  const blockMap = new Map<string, Uint8Array>();
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

  const out: any[] = [];
  function walk(nodeKey: string | undefined) {
    if (!nodeKey) return;
    const nodeBytes = blockMap.get(nodeKey);
    if (!nodeBytes) return;
    let node;
    try { node = cborValue({ bytes: nodeBytes, pos: 0 }, true); } catch { return; }
    if (node.l && node.l[CID_LINK]) walk(node.l[CID_LINK]);
    for (const entry of node.e || []) {
      const recCidKey = entry.v && entry.v[CID_LINK];
      const recBytes = recCidKey && blockMap.get(recCidKey);
      if (recBytes) {
        let rec;
        try { rec = cborDecode(recBytes); } catch { rec = null; }
        if (rec && rec.$type === wantedType) out.push(rec);
      }
      if (entry.t && entry.t[CID_LINK]) walk(entry.t[CID_LINK]);
    }
  }
  walk(rootMstKey);
  return out;
}

// ---- identity resolution (copy of sites/backscroll/public/lib/identity.js) ---

async function jget(url: string): Promise<any> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
}

const PUB = "https://public.api.bsky.app/xrpc";

async function resolveDid(actor: string): Promise<string> {
  const a = (actor || "").trim().replace(/^@/, "").replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "").split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await jget(`https://${host}/.well-known/did.json`);
    } else {
      doc = await jget(`https://plc.directory/${encodeURIComponent(did)}`);
    }
    const svc = (doc.service || []).find((s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
    return (svc && svc.serviceEndpoint) || null;
  } catch (_) {
    return null;
  }
}

// Fallback only, used when the repo CAR download fails (oversized repo,
// non-CORS/unreachable PDS, malformed CAR). 400 pages (~40k posts) mirrors
// kevinmoot's FOLLOWERS_PAGES backstop (notes/40-new-site-playbook.md,
// "question every cap" order) — the walk still has to paginate here because
// the primary bulk path already failed, but the page count itself is a
// generosity knob, not a safety limit.
const FEED_FALLBACK_PAGES = 400;

async function walkFeedFallback(did: string): Promise<string[]> {
  const texts: string[] = [];
  let cursor = "";
  for (let p = 0; p < FEED_FALLBACK_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d: any;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      if (item.reason) continue; // repost, not their own words
      const t = item.post?.record?.text;
      if (typeof t === "string" && t.trim()) texts.push(t);
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return texts;
}

// ---- glaze scoring -------------------------------------------------------
//
// A weighted grep over each post's text, same "no LLM judgment, just grep"
// spirit as sites/griftindex and sites/unpalatable: transparent, and every
// visitor can see exactly what phrases moved the number. Weight is roughly
// "how load-bearing is this phrase as pure hype" — a bare compliment scores
// low, a full glaze-tier superlative scores high.
const GLAZE_TERMS: Array<[RegExp, number, string]> = [
  [/\bthe\s+goat\b/gi, 3, "the goat"],
  [/\bgoated\b/gi, 3, "goated"],
  [/\biconic\b/gi, 3, "iconic"],
  [/\blegend(?:ary)?\b/gi, 3, "legend(ary)"],
  [/\bunmatched\b/gi, 3, "unmatched"],
  [/\bnational treasure\b/gi, 3, "national treasure"],
  [/\bhire (?:her|him|them)\b/gi, 3, "hire her/him/them"],
  [/\bunderstood the assignment\b/gi, 3, "understood the assignment"],
  [/\bno notes\b/gi, 3, "no notes"],
  [/\b(?:she|he|they) ate\b(?!\s+(?:breakfast|lunch|dinner|food|pizza))/gi, 3, "[x] ate"],
  [/\bleft no crumbs\b/gi, 3, "left no crumbs"],
  [/\bwe don'?t deserve\b/gi, 3, "we don't deserve [x]"],
  [/\bblessed to witness\b/gi, 3, "blessed to witness"],
  [/\bchef'?s kiss\b/gi, 3, "chef's kiss"],
  [/\bgive (?:her|him|them)(?: your)? money\b/gi, 3, "give them money"],
  [/\bs[\s-]?tier\b/gi, 2, "S tier"],
  [/\btop tier\b/gi, 2, "top tier"],
  [/\bamazing\b/gi, 2, "amazing"],
  [/\bincredible\b/gi, 2, "incredible"],
  [/\bphenomenal\b/gi, 2, "phenomenal"],
  [/\bbrilliant\b/gi, 2, "brilliant"],
  [/\bgenius\b/gi, 2, "genius"],
  [/\bso talented\b/gi, 2, "so talented"],
  [/\binsanely talented\b/gi, 2, "insanely talented"],
  [/\bso good\b/gi, 2, "so good"],
  [/\btoo good\b/gi, 2, "too good"],
  [/\bobsessed with\b/gi, 2, "obsessed with"],
  [/\bin awe of\b/gi, 2, "in awe of"],
  [/\bgo follow\b/gi, 2, "go follow"],
  [/\byou should follow\b/gi, 2, "you should follow"],
  [/\beveryone should follow\b/gi, 2, "everyone should follow"],
  [/\bcriminally underrated\b/gi, 2, "criminally underrated"],
  [/\bqueen\b/gi, 2, "queen"],
  [/\bsuch an icon\b/gi, 2, "such an icon"],
  [/\bslay(?:ed|ing)?\b/gi, 2, "slay"],
  [/\bimmaculate\b/gi, 2, "immaculate"],
  [/\bflawless\b/gi, 2, "flawless"],
  [/\bmasterpiece\b/gi, 2, "masterpiece"],
  [/\bso proud of\b/gi, 2, "so proud of"],
  [/\b10\/10\b/g, 2, "10/10"],
  [/\bunderrated\b/gi, 1, "underrated"],
  [/\blove (?:this|that)\b/gi, 1, "love this/that"],
  [/\bgreat job\b/gi, 1, "great job"],
  [/\bwell deserved\b/gi, 1, "well deserved"],
  [/\byesss+\b/gi, 1, "yesss"],
  [/\bs+o{3,}\b/gi, 1, "soooo"],
  [/\bso happy for\b/gi, 1, "so happy for"],
  [/\bso cool\b/gi, 1, "so cool"],
  [/🔥/g, 1, "🔥"],
  [/👑/g, 1, "👑"],
  [/💯/g, 1, "💯"],
  [/✨/g, 1, "✨"],
  [/🙏/g, 1, "🙏"],
  [/😭😭/g, 1, "😭😭"],
  [/!{3,}/g, 1, "!!! (emphasis)"],
];

// @mfzx.net, replying to their own original ask: "not for glazing in
// general, just for atproto" — the score was crediting any hype post
// (goat, iconic, hire her...) regardless of subject. This gates each post's
// glaze hits on the post itself also being about the atproto ecosystem, so
// "she's the goat" about a musician no longer counts but "atproto's goat"
// or a compliment aimed at a bluesky/atproto project does. Same grep-only
// spirit as GLAZE_TERMS: no LLM judgment, just a second keyword pass.
const ATPROTO_TERMS =
  /\b(atproto|at protocol|at-proto|bluesky|bsky|\.bsky\.social|pds|appview|lexicons?|jetstream|firehose|xrpc|did:plc|did:web|decentralized social|skeet|skeeted|whitewind|smoke ?signal|frontpage\.fyi|leaflet\.pub|statusphere|tangled\.sh|ozone|labeler|custom feed|com\.atproto|app\.bsky|chat\.bsky|atprotozoa)\b/i;

function isAtprotoContext(text: string): boolean {
  return ATPROTO_TERMS.test(text);
}

function scoreText(text: string): { weighted: number; hits: Array<{ label: string; count: number }> } {
  let weighted = 0;
  const hits: Array<{ label: string; count: number }> = [];
  for (const [re, weight, label] of GLAZE_TERMS) {
    const m = text.match(re);
    if (m && m.length) {
      weighted += m.length * weight;
      hits.push({ label, count: m.length });
    }
  }
  return { weighted, hits };
}

function truncate(s: string, max: number): string {
  s = s.trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

interface GlazeResult {
  score: number;
  postCount: number;
  atprotoPostCount: number;
  totalWeighted: number;
  topTerms: Array<{ label: string; count: number }>;
  topQuotes: string[];
}

// density = average weighted hit-score per post. Mapped through a saturating
// curve (1 - e^-x) rather than a linear scale so an account that glazes
// once in a while doesn't cap out at 1000 alongside someone who does it in
// nearly every post — the curve has to be worked for the whole top half of
// the range.
const DENSITY_SCALE = 0.9;

function computeGlazeScore(texts: string[]): GlazeResult {
  let totalWeighted = 0;
  let atprotoPostCount = 0;
  const termCounts = new Map<string, number>();
  const scored: Array<{ text: string; weighted: number }> = [];
  for (const text of texts) {
    if (!text || !text.trim()) continue;
    if (!isAtprotoContext(text)) continue; // glazing about something else doesn't count
    atprotoPostCount++;
    const { weighted, hits } = scoreText(text);
    totalWeighted += weighted;
    if (weighted > 0) {
      scored.push({ text, weighted });
      for (const h of hits) termCounts.set(h.label, (termCounts.get(h.label) || 0) + h.count);
    }
  }
  const postCount = texts.length;
  // density is still spread over the *whole* post history, not just the
  // atproto-tagged subset — someone who only ever posts about atproto and
  // glazes constantly should still outscore someone who mentions atproto
  // once a month with the same enthusiasm.
  const density = totalWeighted / Math.max(1, postCount);
  const score = Math.max(0, Math.min(1000, Math.round(1000 * (1 - Math.exp(-density / DENSITY_SCALE)))));

  scored.sort((a, b) => b.weighted - a.weighted || a.text.length - b.text.length);
  const topQuotes = scored.slice(0, 3).map((s) => truncate(s.text, 220));
  const topTerms = Array.from(termCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return { score, postCount, atprotoPostCount, totalWeighted, topTerms, topQuotes };
}

// ---- leaderboard (one KV blob, same pattern as sites/chickenjack) --------

interface LeaderboardEntry {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  score: number;
  postCount: number;
  atprotoPostCount: number;
  topTerms: Array<{ label: string; count: number }>;
  topQuotes: string[];
  scoredAt: string;
}

// Cap on stored entries: a KV value maxes out at 25MB, and each entry here
// (a few quotes + term counts) runs well under 1KB, so 2000 entries stays
// tiny — this is a storage-size backstop, not a "some limit felt safer" cap.
const LEADERBOARD_CAP = 2000;

async function loadLeaderboard(env: Env): Promise<LeaderboardEntry[]> {
  const data = await env.LEADERBOARD.get("leaderboard", "json");
  return Array.isArray(data) ? data : [];
}

async function saveLeaderboard(env: Env, entries: LeaderboardEntry[]): Promise<void> {
  await env.LEADERBOARD.put("leaderboard", JSON.stringify(entries));
}

async function upsertLeaderboard(env: Env, entry: LeaderboardEntry): Promise<{ entries: LeaderboardEntry[]; rank: number }> {
  let entries = await loadLeaderboard(env);
  entries = entries.filter((e) => e.did !== entry.did);
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score || b.postCount - a.postCount);
  if (entries.length > LEADERBOARD_CAP) entries = entries.slice(0, LEADERBOARD_CAP);
  await saveLeaderboard(env, entries);
  const rank = entries.findIndex((e) => e.did === entry.did) + 1;
  return { entries, rank };
}

async function scoreAccount(env: Env, rawHandle: string): Promise<LeaderboardEntry & { rank: number; totalScored: number; fetchMethod: string }> {
  const did = await resolveDid(rawHandle);
  const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).catch(() => null);
  const handle = (profile && profile.handle) || rawHandle.replace(/^@/, "");
  const displayName = (profile && profile.displayName) || handle;
  const avatar = (profile && profile.avatar) || "";

  let texts: string[] = [];
  let fetchMethod = "repo";
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS found");
    const records = await fetchRepoRecords(pds, did, "app.bsky.feed.post");
    texts = records.map((r) => r.text).filter((t) => typeof t === "string");
  } catch (_) {
    fetchMethod = "feed-fallback";
    texts = await walkFeedFallback(did);
  }

  if (!texts.length) throw new Error("couldn't find any posts for that account");

  const result = computeGlazeScore(texts);
  const entry: LeaderboardEntry = {
    did,
    handle,
    displayName,
    avatar,
    score: result.score,
    postCount: result.postCount,
    atprotoPostCount: result.atprotoPostCount,
    topTerms: result.topTerms,
    topQuotes: result.topQuotes,
    scoredAt: new Date().toISOString(),
  };
  const { entries, rank } = await upsertLeaderboard(env, entry);
  return { ...entry, rank, totalScored: entries.length, fetchMethod };
}

// ---- OG unfurl for /u/<handle> (copy of sites/didscope's renderShare) ----
//
// Reads the cached leaderboard entry instead of recomputing: a link-unfurl
// bot fetch has a tight timeout, and a fresh score needs a multi-second
// CAR download. If the handle hasn't been scored yet, the page still serves
// (generic OG, live page underneath auto-runs the scorer for a human
// visitor) rather than a dead link.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "glazerank — the atproto glazer score";
const GENERIC_DESC =
  "Enter a Bluesky handle and glazerank reads their whole post history for goat, iconic, no notes, hire her, and everything in between — but only the ones actually about atproto/bluesky — 0 to 1000, ranked on a live leaderboard.";
const GENERIC_OG_URL_ATTR = 'content="https://glazerank.bisks.net/"';

function glazeTitle(score: number): string {
  if (score >= 900) return "certified ATProto glazer";
  if (score >= 750) return "professional hype account";
  if (score >= 550) return "generous with the compliments";
  if (score >= 350) return "keeps it warm but honest";
  if (score >= 150) return "measured, occasionally kind";
  return "certified hater";
}

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(rawHandle || "").replace(/^@/, "").trim();
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const entries = await loadLeaderboard(env);
    const entry = entries.find((e) => e.handle.toLowerCase() === handle.toLowerCase() || e.did === handle);
    if (!entry) return new Response(html, { headers: base.headers });

    const title = `glazerank: @${entry.handle} scores ${entry.score}/1000 — ${glazeTitle(entry.score)}`;
    const topLine = entry.topQuotes[0] ? ` Exhibit A: "${truncate(entry.topQuotes[0], 100)}"` : "";
    const desc = truncate(
      `Scanned ${entry.postCount} posts.${topLine} #${(entries.findIndex((e) => e.did === entry.did) + 1)} on the leaderboard.`,
      300,
    );
    const ogUrl = `https://glazerank.bisks.net/u/${encodeURIComponent(entry.handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/score" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const handle = typeof body.handle === "string" ? body.handle.trim() : "";
      if (!handle) return json({ error: "missing handle" }, 400);
      try {
        const result = await scoreAccount(env, handle);
        return json(result);
      } catch (err: any) {
        return json({ error: err?.message || "couldn't score that account" }, 400);
      }
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const entries = await loadLeaderboard(env);
      return json({ entries: entries.slice(0, 100), total: entries.length });
    }

    const shareMatch = url.pathname.match(/^\/u\/([^/]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    return env.ASSETS.fetch(request);
  },
};

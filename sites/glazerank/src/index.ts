// glazerank Worker — glazerank.bisks.net
//
// @mfzx.net asked (replying in a thread about @demigirlboss.bsky.social's
// bio joking she's "ATProto's 19th biggest glazer") for a site with an
// account input that computes an "atproto glazer" score 0-1000 off that
// account's own posts, going back as far as the site can fetch, plus a
// leaderboard. Originally scored hype-superlative keyword hits (goat,
// iconic, no notes...) gated on the post being atproto-related; @mfzx.net
// came back and asked for a better indicator — "how much does this account
// talk about atproto/bluesky/other atmosphere apps" — so the score is now
// pure topic-mention density, see TOPIC_TERMS below. Same ask reset the
// leaderboard (old entries were scored under the old metric and aren't
// comparable), done by bumping the KV key, see LEADERBOARD_KEY.
//
// Same thread, one more round: @mfzx.net asked to also count non-bsky
// records in the repo — actually having used another atproto app (a blog
// post on whitewind, a status, a calendar event...) as a second signal
// alongside just talking about the ecosystem. See isBskyCollection/
// computeNonBskyStats and the TOPIC_WEIGHT/EXPLORE_WEIGHT split below.
//
// One more round after the density recalibration: @mfzx.net pointed out
// "bsky"/".bsky.social" mostly show up as other people's handles (replies,
// quote-posts) rather than the poster actually talking about bluesky — see
// MENTION_DERANK_WEIGHT below.
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

// Downloads `pds`'s repo CAR for `did` and walks its MST once, pulling out
// every post's text (for the topic-density score) AND tallying every
// record's $type (for the non-bsky exploration score below) in the same
// pass — a repo CAR is one bulk download, so it's free to read what's
// already in hand rather than re-fetching to answer a second question.
// Throws on network/oversize/malformed-CAR failure; caller falls back to a
// paginated getAuthorFeed walk (which can only ever see app.bsky.feed.post,
// so the exploration count is unavailable in that fallback path).
async function fetchRepoData(pds: string, did: string): Promise<{ postTexts: string[]; typeCounts: Map<string, number> }> {
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

  const postTexts: string[] = [];
  const typeCounts = new Map<string, number>();
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
        if (rec && typeof rec.$type === "string") {
          typeCounts.set(rec.$type, (typeCounts.get(rec.$type) || 0) + 1);
          if (rec.$type === "app.bsky.feed.post" && typeof rec.text === "string") postTexts.push(rec.text);
        }
      }
      if (entry.t && entry.t[CID_LINK]) walk(entry.t[CID_LINK]);
    }
  }
  walk(rootMstKey);
  return { postTexts, typeCounts };
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

// ---- topic scoring --------------------------------------------------------
//
// @mfzx.net, replying to their own original ask: "a better indicator than
// 'keyword-searching for the few positive-valence terms you've picked out'
// would just be 'how much does this account talk about atproto/bluesky/other
// atmosphere apps'" — this replaces the old hype-superlative grep (goat,
// iconic, no notes...) entirely. It no longer matters *how* someone talks
// about the ecosystem, just how much of their posting is about it at all.
// Same "no LLM judgment, just grep" spirit as before (and as
// sites/griftindex and sites/unpalatable): transparent, and every visitor
// can see exactly which terms moved the number — just counting topic
// mentions now instead of praise words.
const TOPIC_TERMS: Array<[RegExp, string]> = [
  [/\bat\s?protocol\b/gi, "at protocol"],
  [/\bat-proto\b/gi, "at-proto"],
  [/\batproto\b/gi, "atproto"],
  [/\batprotozoa\b/gi, "atprotozoa"],
  [/\bbluesky\b/gi, "bluesky"],
  [/\bbsky\b/gi, "bsky"],
  [/\.bsky\.social\b/gi, ".bsky.social"],
  [/\bpds\b/gi, "pds"],
  [/\bappview\b/gi, "appview"],
  [/\blexicons?\b/gi, "lexicon(s)"],
  [/\bjetstream\b/gi, "jetstream"],
  [/\bfirehose\b/gi, "firehose"],
  [/\bxrpc\b/gi, "xrpc"],
  [/\bdid:plc\b/gi, "did:plc"],
  [/\bdid:web\b/gi, "did:web"],
  [/\bdecentralized social\b/gi, "decentralized social"],
  [/\bskeeted?\b/gi, "skeet(ed)"],
  [/\bwhitewind\b/gi, "whitewind"],
  [/\bsmoke ?signal\b/gi, "smokesignal"],
  [/\bfrontpage\.fyi\b/gi, "frontpage.fyi"],
  [/\bleaflet\.pub\b/gi, "leaflet.pub"],
  [/\bstatusphere\b/gi, "statusphere"],
  [/\btangled\.sh\b/gi, "tangled.sh"],
  [/\bozone\b/gi, "ozone"],
  [/\blabelers?\b/gi, "labeler(s)"],
  [/\bcustom feeds?\b/gi, "custom feed(s)"],
  [/\bcom\.atproto\b/gi, "com.atproto"],
  [/\bapp\.bsky\b/gi, "app.bsky"],
  [/\bchat\.bsky\b/gi, "chat.bsky"],
];

// ---- non-bsky record scoring ----------------------------------------------
//
// @mfzx.net, in the same thread, asked to fold in "the amount of non-bsky
// records in the account's repo" as a sign of having explored the atmosphere
// beyond bsky — someone whose repo also holds a com.whtwnd.blog.entry or a
// pub.leaflet.document has actually gone and used another atproto app, which
// no amount of *talking* about atproto in bsky posts can substitute for.
// app.bsky.* and chat.bsky.* are Bluesky's own namespaces (posts, likes,
// follows, DMs, profile...) so those don't count as "beyond bsky"; anything
// else in the repo — a blog entry, a calendar event, a status, a repo on
// tangled — does.
function isBskyCollection(type: string): boolean {
  return type.startsWith("app.bsky.") || type.startsWith("chat.bsky.");
}

interface NonBskyStats {
  count: number;
  collections: Array<{ label: string; count: number }>;
}

function computeNonBskyStats(typeCounts: Map<string, number>): NonBskyStats {
  let count = 0;
  const collections: Array<{ label: string; count: number }> = [];
  for (const [type, n] of typeCounts) {
    if (isBskyCollection(type)) continue;
    count += n;
    collections.push({ label: type, count: n });
  }
  collections.sort((a, b) => b.count - a.count);
  return { count, collections: collections.slice(0, 8) };
}

// @mfzx.net, replying in the same thread the DENSITY_SCALE fix landed in:
// "you might want to derank '.bsky.social' somewhat as it appears in
// mentions that don't indicate the user is actually talking about bluesky
// ('bsky' might also be affected by this)". Both terms are structurally
// handle-shaped: the ".bsky.social" regex can only ever match inside a
// "name.bsky.social" string, and a bare "bsky" match is either part of that
// same handle or sits right after an "@" (someone else's app.bsky handle,
// e.g. "@bsky.app"). Neither case is the poster talking about the
// ecosystem themselves, so both get counted for less rather than dropped
// outright — replying to a bluesky account is still weak evidence the
// poster is *in* the atmosphere, just not as strong as saying so directly.
const MENTION_DERANK_WEIGHT = 0.25;

const BSKY_SOCIAL_RE = TOPIC_TERMS.find(([, label]) => label === ".bsky.social")![0];

function isMentionContext(text: string, matchIndex: number): boolean {
  const prefix = text.slice(Math.max(0, matchIndex - 60), matchIndex);
  return /@[a-zA-Z0-9._-]*$/.test(prefix);
}

function scoreTopicMentions(text: string): { total: number; hits: Array<{ label: string; count: number }> } {
  let total = 0;
  const hits: Array<{ label: string; count: number }> = [];

  // handle spans (name.bsky.social) computed up front so the "bsky" term
  // below can skip hits that fall inside one — otherwise a single handle
  // like "alice.bsky.social" scores as two separate topic mentions
  const handleSpans = Array.from(text.matchAll(BSKY_SOCIAL_RE)).map(
    (m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as [number, number],
  );

  for (const [re, label] of TOPIC_TERMS) {
    let matches = Array.from(text.matchAll(re));
    if (!matches.length) continue;

    if (label === "bsky") {
      matches = matches.filter((m) => {
        const idx = m.index ?? 0;
        return !handleSpans.some(([s, e]) => idx >= s && idx < e);
      });
      if (!matches.length) continue;
    }

    hits.push({ label, count: matches.length });

    if (label === "bsky") {
      for (const m of matches) total += isMentionContext(text, m.index ?? 0) ? MENTION_DERANK_WEIGHT : 1;
    } else if (label === ".bsky.social") {
      total += matches.length * MENTION_DERANK_WEIGHT;
    } else {
      total += matches.length;
    }
  }
  return { total, hits };
}

function truncate(s: string, max: number): string {
  s = s.trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

interface GlazeResult {
  score: number;
  topicScore: number;
  exploreScore: number;
  postCount: number;
  atprotoPostCount: number;
  totalMentions: number;
  topTerms: Array<{ label: string; count: number }>;
  topQuotes: string[];
  nonBskyRecordCount: number;
  nonBskyCollections: Array<{ label: string; count: number }>;
  nonBskyCounted: boolean;
}

// density = average atmosphere-topic mentions per post, spread over the
// *whole* post history (not just the on-topic subset) — someone who only
// ever posts about atproto scores higher than someone who mentions it once
// a month, even at the same per-mention rate. Mapped through a saturating
// curve (1 - e^-x) rather than linear so an account that brings it up
// occasionally doesn't cap out alongside someone who talks about nothing
// else — the curve has to be worked for the whole top half of the range.
//
// Recalibrated 2026-09-04: @mfzx.net reported the score looked "way off" —
// their account had 500+ posts mentioning atproto terms (167 "bluesky", 142
// "atproto", 111 "bsky"...) but scored 85/1000, "barely talks about it".
// Root cause was this constant, not the density formula itself: at the old
// value (1.4), climbing to "brings it up constantly" required a density of
// ~1.0 — i.e. every single post across an account's *entire* history,
// years of unrelated chatter included, averaging a full topic mention.
// That's a bar only a single-purpose bot could clear, so any real long-time
// poster capped out in the bottom tier regardless of how much of their
// posting was actually on-topic. Retuned so an account whose posts mention
// the topic roughly a third of the time lands in "certified ATProto poster"
// territory and one that does so about half the time is "posts about
// nothing else".
const DENSITY_SCALE = 0.16;

// Same run, @mfzx.net asked to also fold in non-bsky repo records (see
// isBskyCollection/computeNonBskyStats above) as a second, independent
// signal: talking about the atmosphere isn't the same as having actually
// used another app in it. Split as two additive, saturating components
// rather than blended into one density figure, so both stay individually
// legible (the UI shows "topic score" and "beyond-bsky bonus" separately)
// and so a topic-talk-only account can still reach a respectable score
// without ever having touched a second app. TOPIC_WEIGHT leaves headroom for
// EXPLORE_WEIGHT so the two combined still saturate at 1000, same ceiling as
// before this feature existed.
const TOPIC_WEIGHT = 850;
const EXPLORE_WEIGHT = 150;
// Curve reaches ~63% of EXPLORE_WEIGHT at 6 non-bsky records, ~95% at 18 —
// a handful of posts to a blog/status/calendar app already counts as real
// exploration, it doesn't take dozens to matter.
const EXPLORE_SCALE = 6;

function computeGlazeScore(texts: string[], nonBsky: NonBskyStats & { counted: boolean }): GlazeResult {
  let totalMentions = 0;
  let atprotoPostCount = 0;
  const termCounts = new Map<string, number>();
  const scored: Array<{ text: string; mentions: number }> = [];
  for (const text of texts) {
    if (!text || !text.trim()) continue;
    const { total, hits } = scoreTopicMentions(text);
    if (total === 0) continue;
    atprotoPostCount++;
    totalMentions += total;
    scored.push({ text, mentions: total });
    for (const h of hits) termCounts.set(h.label, (termCounts.get(h.label) || 0) + h.count);
  }
  const postCount = texts.length;
  const density = totalMentions / Math.max(1, postCount);
  const topicScore = TOPIC_WEIGHT * (1 - Math.exp(-density / DENSITY_SCALE));
  const exploreScore = nonBsky.counted
    ? EXPLORE_WEIGHT * (1 - Math.exp(-nonBsky.count / EXPLORE_SCALE))
    : 0;
  const score = Math.max(0, Math.min(1000, Math.round(topicScore + exploreScore)));

  scored.sort((a, b) => b.mentions - a.mentions || a.text.length - b.text.length);
  const topQuotes = scored.slice(0, 3).map((s) => truncate(s.text, 220));
  const topTerms = Array.from(termCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return {
    score,
    topicScore: Math.round(topicScore),
    exploreScore: Math.round(exploreScore),
    postCount,
    atprotoPostCount,
    totalMentions,
    topTerms,
    topQuotes,
    nonBskyRecordCount: nonBsky.count,
    nonBskyCollections: nonBsky.collections,
    nonBskyCounted: nonBsky.counted,
  };
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
  nonBskyRecordCount: number;
  nonBskyCollections: Array<{ label: string; count: number }>;
  scoredAt: string;
}

// Cap on stored entries: a KV value maxes out at 25MB, and each entry here
// (a few quotes + term counts) runs well under 1KB, so 2000 entries stays
// tiny — this is a storage-size backstop, not a "some limit felt safer" cap.
const LEADERBOARD_CAP = 2000;

// @mfzx.net asked to reset the leaderboard when the scoring metric changed
// (old entries were scored under the retired hype-keyword algorithm and
// aren't comparable to topic-mention scores). This build agent has no
// credentials to touch the live KV store directly, so the reset is a code
// change instead: bumping the key means the old "leaderboard" blob is simply
// never read again, and everyone starts fresh under "leaderboard-v2".
//
// Bumped again to "leaderboard-v3" on 2026-09-04 alongside the DENSITY_SCALE
// recalibration above — same reasoning as the first bump, scores computed
// under the old scale aren't comparable to scores under the new one.
//
// Bumped once more to "leaderboard-v4" the same day, when the non-bsky
// exploration bonus was added: every entry scored under v3 was computed with
// no such bonus at all, so re-ranking them against fresh v4 scores would
// silently underrate whoever gets rescanned first.
//
// Bumped to "leaderboard-v5" when the mention-deranking above landed: any
// account whose score leaned on lots of "bsky"/".bsky.social" hits from
// handle mentions (replies, quote-posts) scores lower under v5, so v4
// entries aren't comparable.
const LEADERBOARD_KEY = "leaderboard-v5";

async function loadLeaderboard(env: Env): Promise<LeaderboardEntry[]> {
  const data = await env.LEADERBOARD.get(LEADERBOARD_KEY, "json");
  return Array.isArray(data) ? data : [];
}

async function saveLeaderboard(env: Env, entries: LeaderboardEntry[]): Promise<void> {
  await env.LEADERBOARD.put(LEADERBOARD_KEY, JSON.stringify(entries));
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

async function scoreAccount(env: Env, rawHandle: string): Promise<
  LeaderboardEntry & { rank: number; totalScored: number; fetchMethod: string; topicScore: number; exploreScore: number; nonBskyCounted: boolean }
> {
  const did = await resolveDid(rawHandle);
  const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).catch(() => null);
  const handle = (profile && profile.handle) || rawHandle.replace(/^@/, "");
  const displayName = (profile && profile.displayName) || handle;
  const avatar = (profile && profile.avatar) || "";

  let texts: string[] = [];
  let fetchMethod = "repo";
  let nonBsky: NonBskyStats & { counted: boolean } = { count: 0, collections: [], counted: false };
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS found");
    const { postTexts, typeCounts } = await fetchRepoData(pds, did);
    texts = postTexts;
    nonBsky = { ...computeNonBskyStats(typeCounts), counted: true };
  } catch (_) {
    fetchMethod = "feed-fallback";
    texts = await walkFeedFallback(did);
  }

  if (!texts.length) throw new Error("couldn't find any posts for that account");

  const result = computeGlazeScore(texts, nonBsky);
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
    nonBskyRecordCount: result.nonBskyRecordCount,
    nonBskyCollections: result.nonBskyCollections,
    scoredAt: new Date().toISOString(),
  };
  const { entries, rank } = await upsertLeaderboard(env, entry);
  return {
    ...entry,
    rank,
    totalScored: entries.length,
    fetchMethod,
    topicScore: result.topicScore,
    exploreScore: result.exploreScore,
    nonBskyCounted: result.nonBskyCounted,
  };
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
  "Enter a Bluesky handle and glazerank reads their whole post history and repo, scoring how much they talk about atproto/bluesky/the atmosphere plus a bonus for records in non-bsky atproto apps — 0 to 1000, ranked on a live leaderboard.";
const GENERIC_OG_URL_ATTR = 'content="https://glazerank.bisks.net/"';

function glazeTitle(score: number): string {
  if (score >= 900) return "posts about nothing else";
  if (score >= 750) return "certified ATProto poster";
  if (score >= 550) return "brings it up constantly";
  if (score >= 350) return "mentions it regularly";
  if (score >= 150) return "brings it up occasionally";
  return "barely talks about it";
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

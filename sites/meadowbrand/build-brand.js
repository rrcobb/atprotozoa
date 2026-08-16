// Bakes fromthewestmeadow.com's "brand" analysis into public/data/brand.json
// — the only data this static site ever serves. Re-run by hand to refresh it
// as they keep posting:
//
//   node build-brand.js
//
// Pulls their whole repo as one com.atproto.sync.getRepo CAR download off
// their own PDS — same "cars instead of looping on the read endpoint" swap
// @bisks.net asked for elsewhere (sites/ceemilarity, sites/ngmi, ...) — and
// reads EVERY record collection, not just app.bsky.feed.post. That's the
// actual ask: "describes my brand after you analyze my CAR file" means the
// whole repo, not just the posts. The CAR/DAG-CBOR parser here is a plain
// CommonJS copy of sites/ceemilarity/build-profile.js's (that file explains
// why it's a separate copy rather than importing the ES module version).
//
// House style: self-contained, copy-don't-abstract, no secrets (this only
// hits the public, unauthenticated AppView and the account's own PDS).

const fs = require("node:fs");
const path = require("node:path");

const HANDLE = "fromthewestmeadow.com";
const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""));
  if (!res.ok) throw new Error(`${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---- PDS resolution (copy of public/lib/identity.js's resolvePds) ----

async function resolvePds(did) {
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
}

// ---- CAR/DAG-CBOR parsing (copy of public/lib/car.js, as CommonJS, all types) ----

const CAR_MAX_BYTES = 400 * 1024 * 1024;
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
  offset += headerLen;

  while (offset < bytes.length) {
    let blockLen;
    [blockLen, offset] = readVarint(bytes, offset);
    if (!blockLen) break;
    const blockEnd = offset + blockLen;

    let o = offset;
    let cidCodec, hashLen;
    [, o] = readVarint(bytes, o);
    [cidCodec, o] = readVarint(bytes, o);
    [, o] = readVarint(bytes, o);
    [hashLen, o] = readVarint(bytes, o);
    o += hashLen;

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
    return hi * 4294967296 + lo;
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
    case 6: return cborValue(st);
    default: throw new Error("unsupported CBOR major type " + majorType);
  }
}

// Downloads the whole repo CAR and decodes every record in it (not filtered
// by type — this build wants the full collection breakdown), yielding
// { $type, ...fields } objects in CAR order (no rkey needed for this pass).
async function fetchAllRecords(pds, did) {
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
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || !obj.$type) continue;
    out.push(obj);
  }
  return { records: out, bytes: buf.byteLength };
}

// ---- analysis ----

const STOPWORDS = new Set(
  ("the a an and or but if then so to of in on at for with as is are was were be been being " +
   "this that these those i you he she it we they my your his her its our their me him them us " +
   "not no yes just very really so much more most some any all no one no's do does did doing " +
   "have has had having will would can could should shall might must im ive youre youve dont " +
   "cant wont im its it's i'm that's there's here's what's who's don't can't won't didn't isn't " +
   "wasn't wouldn't couldn't shouldn't he's she's they're you're we're i've you've they've " +
   "there here when where why how what who which am ok oh yeah like get got going go up out " +
   "into over under about again also still even than then well one two lol now from " +
   "youre theyre were was wasnt isnt wouldnt couldnt shouldnt hes shes were").split(/\s+/),
);

const URL_RE = /https?:\/\/\S+/g;
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const MENTION_RE = /@[a-zA-Z0-9.\-]+/g;

function stripLinksAndMentions(text) {
  return text.replace(URL_RE, " ").replace(MENTION_RE, " ");
}

function topN(counter, n) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

function analyzePosts(posts) {
  const wordCounts = new Map();
  const emojiCounts = new Map();
  const hashtagCounts = new Map();
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);

  let totalWords = 0;
  let questionCount = 0;
  let exclaimCount = 0;
  let replyCount = 0;
  let emojiTotal = 0;
  let earliest = null;
  let latest = null;

  for (const p of posts) {
    const text = p.text || "";
    const created = p.createdAt ? new Date(p.createdAt) : null;
    if (created && !isNaN(created)) {
      if (!earliest || created < earliest) earliest = created;
      if (!latest || created > latest) latest = created;
      byHour[created.getUTCHours()]++;
      byWeekday[created.getUTCDay()]++;
    }
    if (p.isReply) replyCount++;

    const stripped = stripLinksAndMentions(text);
    const words = stripped.match(WORD_RE) || [];
    totalWords += words.length;
    for (const w of words) {
      const lw = w.toLowerCase().replace(/[’‘]/g, "'");
      if (lw.length < 3 || STOPWORDS.has(lw) || /^\d+$/.test(lw)) continue;
      wordCounts.set(lw, (wordCounts.get(lw) || 0) + 1);
    }

    const emojis = text.match(EMOJI_RE) || [];
    emojiTotal += emojis.length;
    for (const e of emojis) emojiCounts.set(e, (emojiCounts.get(e) || 0) + 1);

    const hashtags = text.match(HASHTAG_RE) || [];
    for (const h of hashtags) hashtagCounts.set(h.toLowerCase(), (hashtagCounts.get(h.toLowerCase()) || 0) + 1);

    const t = text.trim();
    if (t.endsWith("?")) questionCount++;
    if (t.endsWith("!")) exclaimCount++;
  }

  const n = posts.length || 1;
  const daysActive = earliest && latest ? Math.max(1, Math.round((latest - earliest) / 86400000)) : 0;

  return {
    count: posts.length,
    avgWords: totalWords / n,
    questionPct: (questionCount / n) * 100,
    exclaimPct: (exclaimCount / n) * 100,
    replyPct: (replyCount / n) * 100,
    emojiPerPost: emojiTotal / n,
    topWords: topN(wordCounts, 14),
    topEmoji: topN(emojiCounts, 8),
    topHashtags: topN(hashtagCounts, 8),
    byHour,
    byWeekday,
    earliest: earliest ? earliest.toISOString() : null,
    latest: latest ? latest.toISOString() : null,
    daysActive,
    postsPerDay: daysActive ? posts.length / daysActive : posts.length,
  };
}

// Deterministic "brand palette" — a handful of hues derived from the DID
// itself (a simple string hash → hue), so the same account always gets the
// same colors and no two accounts collide by chance the way a random roll
// would. Held to the dataviz skill's dark-surface categorical steps: fixed
// saturation/lightness band (OKLCH-ish via HSL is close enough at this
// saturation), just the hue rotates per-account.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function brandPalette(did) {
  const seed = hashString(did);
  const baseHue = seed % 360;
  return {
    primary: hslToHex(baseHue, 72, 58),
    secondary: hslToHex((baseHue + 40) % 360, 68, 60),
    accent: hslToHex((baseHue + 200) % 360, 75, 62),
    hue: baseHue,
  };
}

async function main() {
  const identity = await xrpc("com.atproto.identity.resolveHandle", { handle: HANDLE });
  const did = identity.did;
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });

  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't resolve a PDS for " + HANDLE);

  const { records, bytes } = await fetchAllRecords(pds, did);

  const collectionCounts = new Map();
  const posts = [];
  let likeCount = 0;
  let repostCount = 0;
  let followCount = 0;
  let blockCount = 0;
  let listCount = 0;

  // ecosystem-specific tallies — the custom lexicons this bot's own
  // experiments write, present only if the account actually used that site
  let topchicken = { orders: 0, buys: 0, sells: 0, rounds: new Set(), contenders: new Set() };
  let voidShouts = 0, voidMurmurs = 0, voidVotes = 0;
  let griftmaxAscensions = 0;
  let clusterpediaTalks = 0, clusterpediaRevisions = 0;
  let socialcreditVotes = 0, socialcreditDelta = 0;
  let memexPhrases = 0;
  const otherLexicons = new Map(); // any non-app.bsky.* / non-com.atproto.* $type not specifically tallied above

  for (const r of records) {
    const type = r.$type;
    collectionCounts.set(type, (collectionCounts.get(type) || 0) + 1);

    switch (type) {
      case "app.bsky.feed.post":
        posts.push({ text: r.text || "", createdAt: r.createdAt, isReply: !!r.reply });
        break;
      case "app.bsky.feed.like":
        likeCount++;
        break;
      case "app.bsky.feed.repost":
        repostCount++;
        break;
      case "app.bsky.graph.follow":
        followCount++;
        break;
      case "app.bsky.graph.block":
        blockCount++;
        break;
      case "app.bsky.graph.list":
        listCount++;
        break;
      case "wtf.cee.topchicken.order":
        topchicken.orders++;
        if (r.side === "buy") topchicken.buys++;
        else if (r.side === "sell") topchicken.sells++;
        if (r.round) topchicken.rounds.add(r.round);
        if (r.contender) topchicken.contenders.add(r.contender);
        break;
      case "net.bisks.void.shout":
        voidShouts++;
        break;
      case "net.bisks.void.murmur":
        voidMurmurs++;
        break;
      case "net.bisks.void.vote":
        voidVotes++;
        break;
      case "net.bisks.griftmax.ascension":
        griftmaxAscensions++;
        break;
      case "net.bisks.clusterpedia.talk":
        clusterpediaTalks++;
        break;
      case "net.bisks.clusterpedia.revision":
        clusterpediaRevisions++;
        break;
      case "net.bisks.socialcredit.vote":
        socialcreditVotes++;
        socialcreditDelta += typeof r.delta === "number" ? r.delta : 0;
        break;
      case "net.bisks.memex.phrase":
        memexPhrases++;
        break;
      default:
        if (!type.startsWith("app.bsky.") && !type.startsWith("com.atproto.") && !type.startsWith("chat.bsky.")) {
          otherLexicons.set(type, (otherLexicons.get(type) || 0) + 1);
        }
    }
  }

  const totalRecords = records.length;
  const collections = [...collectionCounts.entries()]
    .map(([type, count]) => ({ type, count, pct: (count / totalRecords) * 100 }))
    .sort((a, b) => b.count - a.count);

  const voice = analyzePosts(posts);
  const colors = brandPalette(did);

  // A handful of "pillars" — the shapes this account's repo actually takes,
  // ranked by record count, each with a one-line stat. Only included if the
  // account has records of that shape at all.
  const pillarCandidates = [
    topchicken.orders > 0 && {
      key: "topchicken",
      title: "topchicken trading",
      count: topchicken.orders,
      detail: `${topchicken.orders.toLocaleString()} orders (${topchicken.buys} buy / ${topchicken.sells} sell) across ${topchicken.rounds.size} rounds, backing ${topchicken.contenders.size} contenders`,
    },
    voice.count > 0 && {
      key: "posts",
      title: "bluesky posting",
      count: voice.count,
      detail: `${voice.count.toLocaleString()} posts over ${voice.daysActive.toLocaleString()} days (${voice.postsPerDay.toFixed(2)}/day), ${voice.replyPct.toFixed(0)}% replies`,
    },
    likeCount > 0 && {
      key: "likes",
      title: "liking",
      count: likeCount,
      detail: `${likeCount.toLocaleString()} likes handed out`,
    },
    followCount > 0 && {
      key: "follows",
      title: "following",
      count: followCount,
      detail: `${followCount.toLocaleString()} accounts followed`,
    },
    (voidShouts + voidMurmurs + voidVotes) > 0 && {
      key: "void",
      title: "voidshout presence",
      count: voidShouts + voidMurmurs + voidVotes,
      detail: `${voidShouts} shouts, ${voidMurmurs} murmurs, ${voidVotes} votes`,
    },
    (griftmaxAscensions + clusterpediaTalks + clusterpediaRevisions + socialcreditVotes + memexPhrases) > 0 && {
      key: "ecosystem",
      title: "atprotozoa ecosystem",
      count: griftmaxAscensions + clusterpediaTalks + clusterpediaRevisions + socialcreditVotes + memexPhrases,
      detail: [
        griftmaxAscensions && `${griftmaxAscensions} griftmax ascensions`,
        (clusterpediaTalks + clusterpediaRevisions) && `${clusterpediaTalks + clusterpediaRevisions} clusterpedia edits/talks`,
        socialcreditVotes && `${socialcreditVotes} socialcredit votes (${socialcreditDelta >= 0 ? "+" : ""}${socialcreditDelta} net)`,
        memexPhrases && `${memexPhrases} memex phrases`,
      ].filter(Boolean).join(", "),
    },
  ].filter(Boolean).sort((a, b) => b.count - a.count);

  const out = {
    handle: profile.handle,
    did,
    displayName: profile.displayName || profile.handle,
    avatar: profile.avatar || null,
    description: profile.description || "",
    generatedAt: new Date().toISOString(),
    repoBytes: bytes,
    totals: {
      totalRecords,
      posts: voice.count,
      likes: likeCount,
      reposts: repostCount,
      follows: followCount,
      blocks: blockCount,
      lists: listCount,
    },
    collections,
    otherLexicons: [...otherLexicons.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    topchicken: topchicken.orders > 0 ? {
      orders: topchicken.orders,
      buys: topchicken.buys,
      sells: topchicken.sells,
      rounds: topchicken.rounds.size,
      contenders: topchicken.contenders.size,
    } : null,
    voidnet: { shouts: voidShouts, murmurs: voidMurmurs, votes: voidVotes },
    ecosystem: {
      griftmaxAscensions,
      clusterpediaTalks,
      clusterpediaRevisions,
      socialcreditVotes,
      socialcreditDelta,
      memexPhrases,
    },
    voice,
    colors,
    pillars: pillarCandidates,
  };

  const outPath = path.join(__dirname, "public", "data", "brand.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error(`wrote ${outPath} (${totalRecords} records analyzed, ${voice.count} posts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

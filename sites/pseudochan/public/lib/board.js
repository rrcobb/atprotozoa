// board.js — data layer for pseudochan. One account's posts become an
// imageboard: every top-level post is a thread's OP, the author's own
// follow-ups are its replies. Posts come from the author's own repo in one
// com.atproto.sync.getRepo download (lib/car.js), with a paginated
// getAuthorFeed walk as the fallback when the repo can't be fetched. Replies
// from other people live on the public AppView (getPostThread) and are only
// fetched when a thread page is opened.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://public.api.bsky.app/xrpc";
const POST = "app.bsky.feed.post";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// ---- identity -------------------------------------------------------------

export function cleanActor(input) {
  return (input || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0]
    .trim();
}

export async function resolveDid(actor) {
  const a = cleanActor(actor);
  if (!a) throw new Error("type a handle first");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return { did: p.did, handle: p.handle, displayName: p.displayName || p.handle, avatar: p.avatar || "" };
}

// ---- post IDs -------------------------------------------------------------

const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";

// A TID rkey is a 64-bit number: top bit 0, 53 bits of microseconds since the
// epoch, 10 bits of clock id. Returns the milliseconds, or null if `rkey`
// isn't a TID.
export function tidToMs(rkey) {
  if (!/^[2-7a-z]{13}$/.test(rkey) || TID_ALPHABET.indexOf(rkey[0]) >= 16) return null;
  let v = 0n;
  for (const ch of rkey) v = (v << 5n) | BigInt(TID_ALPHABET.indexOf(ch));
  return Number(v >> 10n) / 1000;
}

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 4chan-style per-thread poster ID, derived from the DID so the same account
// always gets the same ID and colour.
export function posterId(did) {
  const h = hash32(did);
  const h2 = hash32(did + "#");
  return { id: (h.toString(36) + h2.toString(36)).slice(0, 8), hue: h % 360 };
}

export const ID_MODES = [
  { key: "no", label: "No. (timestamp number)" },
  { key: "seq", label: "board seq (#1, #2, …)" },
  { key: "rkey", label: "rkey (TID)" },
  { key: "did", label: "DID" },
];

// The visible post ID, in whichever style is selected. `seq` is the post's
// 1-based position in the board owner's history (null for other people's
// posts, which fall back to the timestamp number).
export function postLabel(post, mode) {
  const ms = tidToMs(post.rkey);
  const no = ms != null ? Math.floor(ms) : hash32(post.uri);
  if (mode === "rkey") return post.rkey;
  if (mode === "did") return post.did;
  if (mode === "seq" && post.seq) return String(post.seq);
  return String(no);
}

// ---- text -----------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { esc };

// Facets index UTF-8 bytes, not characters.
function facetsToHtml(text, facets) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const bytes = enc.encode(text);
  const fs = (Array.isArray(facets) ? facets : [])
    .filter((f) => f && f.index && f.index.byteEnd > f.index.byteStart)
    .sort((a, b) => a.index.byteStart - b.index.byteStart);
  let out = "", pos = 0;
  for (const f of fs) {
    if (f.index.byteStart < pos || f.index.byteEnd > bytes.length) continue;
    out += esc(dec.decode(bytes.subarray(pos, f.index.byteStart)));
    const shown = esc(dec.decode(bytes.subarray(f.index.byteStart, f.index.byteEnd)));
    const feat = (f.features || [])[0] || {};
    let href = null;
    if (feat.$type === "app.bsky.richtext.facet#link" && /^https?:\/\//i.test(feat.uri || "")) href = feat.uri;
    else if (feat.$type === "app.bsky.richtext.facet#mention" && feat.did) href = "https://bsky.app/profile/" + feat.did;
    else if (feat.$type === "app.bsky.richtext.facet#tag" && feat.tag) href = "https://bsky.app/hashtag/" + encodeURIComponent(feat.tag);
    out += href ? `<a href="${esc(href)}" target="_blank" rel="noopener nofollow">${shown}</a>` : shown;
    pos = f.index.byteEnd;
  }
  return out + esc(dec.decode(bytes.subarray(pos)));
}

// Post body → HTML. Lines starting with ">" are greentext, as on any board.
export function renderBody(text, facets) {
  const raw = (text || "").split("\n");
  const html = facetsToHtml(text || "", facets).split("\n");
  return html
    .map((line, i) => (/^\s*>/.test(raw[i] || "") ? `<span class="green">${line}</span>` : line))
    .join("<br>");
}

// ---- normalising posts ----------------------------------------------------

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function blobUrls(did, ref) {
  if (!(ref instanceof Uint8Array)) return null;
  const cid = "b" + base32(ref[0] === 0 ? ref.subarray(1) : ref);
  const base = `https://cdn.bsky.app/img/%S/plain/${did}/${cid}@jpeg`;
  return { thumb: base.replace("%S", "feed_thumbnail"), full: base.replace("%S", "feed_fullsize") };
}

function mediaOf(embed) {
  if (!embed) return null;
  if (embed.$type === "app.bsky.embed.recordWithMedia" || embed.$type === "app.bsky.embed.recordWithMedia#view") return embed.media || null;
  return embed;
}

function base(uri, rec) {
  const parts = uri.split("/");
  return {
    uri,
    did: parts[2],
    rkey: parts[parts.length - 1],
    text: rec.text || "",
    facets: rec.facets || [],
    createdAt: rec.createdAt || "",
    parent: rec.reply?.parent?.uri || null,
    root: rec.reply?.root?.uri || null,
    images: [],
    video: false,
    quote: null,
  };
}

// From a raw repo record (blob refs, no hydrated views).
export function fromRecord(uri, rec) {
  const p = base(uri, rec);
  const m = mediaOf(rec.embed);
  if (m?.$type === "app.bsky.embed.images" && Array.isArray(m.images)) {
    for (const im of m.images) {
      const u = blobUrls(p.did, im.image?.ref);
      if (u) p.images.push({ ...u, alt: im.alt || "" });
    }
  }
  p.video = m?.$type === "app.bsky.embed.video";
  const q = rec.embed?.$type === "app.bsky.embed.record" ? rec.embed.record : rec.embed?.record?.record;
  p.quote = q?.uri || null;
  return p;
}

// From an AppView postView (hydrated image URLs, author profile).
export function fromView(post) {
  const p = base(post.uri, post.record || {});
  p.author = { did: post.author?.did, handle: post.author?.handle, displayName: post.author?.displayName || post.author?.handle, avatar: post.author?.avatar || "" };
  const m = mediaOf(post.embed);
  if (m?.$type === "app.bsky.embed.images#view") {
    for (const im of m.images || []) p.images.push({ thumb: im.thumb, full: im.fullsize || im.thumb, alt: im.alt || "" });
  }
  p.video = m?.$type === "app.bsky.embed.video#view";
  p.quote = post.record?.embed?.record?.uri || post.record?.embed?.record?.record?.uri || null;
  p.likes = post.likeCount || 0;
  p.replyCount = post.replyCount || 0;
  return p;
}

// ---- loading a board ------------------------------------------------------

// Every post the account has made. Repo download first (any amount of
// history in one request). The fallback walks getAuthorFeed to the last page,
// because a repo that failed to download (non-CORS PDS, malformed CAR,
// oversized) is the only reason to be here and the whole history is still the
// goal.
async function allPosts(did, onProgress) {
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS in DID document");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, POST, onProgress);
    return records.map((r) => fromRecord(r.uri, r.value));
  } catch (e) {
    if (onProgress) onProgress(`repo download failed (${e.message}) — paging the feed instead…`);
  }
  const out = [];
  let cursor = "";
  do {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("filter", "posts_with_replies");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    for (const it of d.feed || []) {
      if (it.reason || it.post?.author?.did !== did) continue; // reposts and pins aren't the author's own posts
      out.push(fromView(it.post));
    }
    cursor = d.cursor || "";
    if (onProgress) onProgress(`paging the feed… ${out.length} posts`);
  } while (cursor);
  return out;
}

// Group posts into threads: OP + the author's own replies, plus the author's
// replies-to-others as their own entries. Everything oldest-first; each thread
// gets a `bump` time (last own reply) like a board.
export async function loadBoard(actor, onProgress) {
  const did = await resolveDid(actor);
  if (onProgress) onProgress("fetching profile…");
  const profile = await getProfile(did);
  const posts = await allPosts(did, onProgress);
  return buildBoard(profile, posts);
}

export function buildBoard(profile, posts) {
  posts.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  posts.forEach((p, i) => (p.seq = i + 1));
  const ops = new Map();
  const threads = [];
  for (const p of posts) {
    if (!p.root) {
      const t = { op: p, replies: [], bump: p.createdAt, foreign: false };
      ops.set(p.uri, t);
      threads.push(t);
    }
  }
  for (const p of posts) {
    if (!p.root) continue;
    const t = ops.get(p.root);
    if (t) {
      t.replies.push(p);
      if (p.createdAt > t.bump) t.bump = p.createdAt;
    } else {
      threads.push({ op: p, replies: [], bump: p.createdAt, foreign: true });
    }
  }
  return { profile, posts, threads };
}

// ---- loading a thread -----------------------------------------------------

// A full thread from the AppView: every ancestor of the post plus everything
// under it, flattened and ordered by time like an imageboard thread.
export async function loadThread(did, rkey) {
  const uri = `at://${did}/${POST}/${rkey}`;
  const u = `${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1000&parentHeight=1000`;
  const d = await jget(u);
  const seen = new Map();
  const walkDown = (n) => {
    if (!n?.post) return; // blocked / not-found stubs have no post
    if (!seen.has(n.post.uri)) seen.set(n.post.uri, fromView(n.post));
    for (const r of n.replies || []) walkDown(r);
  };
  let n = d.thread;
  while (n?.parent) { // climb to the root, collecting ancestors
    if (n.post && !seen.has(n.post.uri)) seen.set(n.post.uri, fromView(n.post));
    n = n.parent;
  }
  walkDown(n);
  const posts = [...seen.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  posts.forEach((p) => {
    p.author = p.author || { did: p.did, handle: p.did, displayName: p.did, avatar: "" };
  });
  return { posts, focus: uri };
}

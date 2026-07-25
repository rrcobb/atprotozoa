// immortal.js — turn a Bluesky handle into the raw material for a monument:
// their profile and a curated set of "greatest hits" posts, ranked by
// engagement. Reads Bluesky's PUBLIC AppView anonymously (public.api.bsky.app,
// CORS *, no auth): resolveHandle, getProfile, getAuthorFeed. The resolve/feed
// plumbing is copied+trimmed from alignment-chart/lib/network.js (copy, don't
// abstract).

const PUB = "https://public.api.bsky.app/xrpc";

const FEED_PAGES = 4; // ≤ ~400 recent posts scanned for greatest hits
const HITS = 5; // how many top posts to inscribe on the monument

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from alignment-chart/lib/network.js resolveDid.
export async function resolveDid(actor) {
  const a = cleanHandle(actor);
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

// Normalize whatever someone pasted into a bare handle/DID token.
export function cleanHandle(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

// A post's engagement score. Likes are the loudest signal; reposts and replies
// count for a little too, so a genuinely-discussed post can edge out a
// like-farmed one.
function score(p) {
  return (p.likeCount || 0) + 2 * (p.repostCount || 0) + (p.replyCount || 0);
}

// Pull the profile + the HITS highest-engagement original posts. Returns
// { profile, hits, scanned } — profile is the raw getProfile record, hits is a
// ranked array of { text, uri, url, createdAt, likeCount, repostCount,
// replyCount, score }.
export async function immortalize(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("consulting the records…");
  const profile = await jget(
    `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  );

  if (onStep) onStep("gathering the great works…");
  const posts = [];
  let cursor = "";
  for (let pg = 0; pg < FEED_PAGES; pg++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      if (item.reason) continue; // skip reposts — we want THEIR words
      const post = item.post;
      const text = post?.record?.text;
      if (!text || !text.trim()) continue; // need words to inscribe
      posts.push({
        text,
        uri: post.uri,
        url: postUrl(profile.handle, post.uri),
        createdAt: post.record.createdAt,
        likeCount: post.likeCount || 0,
        repostCount: post.repostCount || 0,
        replyCount: post.replyCount || 0,
        score: score(post),
      });
    }
    cursor = d.cursor;
    if (!cursor) break;
  }

  posts.sort((a, b) => b.score - a.score);
  const hits = posts.slice(0, HITS);

  return { did, profile, hits, scanned: posts.length };
}

// Turn an at:// post URI into a bsky.app permalink.
function postUrl(handle, uri) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// A deterministic Roman-numeral "reign" number from a DID, so every monument
// gets a grand ordinal that's stable between visits (no Math.random flicker).
export function reignNumeral(did) {
  let h = 0;
  for (let i = 0; i < did.length; i++) h = (h * 31 + did.charCodeAt(i)) | 0;
  const n = ((h >>> 0) % 900) + 100; // 100..999, always looks weighty
  return { n, roman: toRoman(n) };
}

function toRoman(num) {
  const map = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"],
    [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"],
    [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of map) {
    while (num >= v) {
      out += s;
      num -= v;
    }
  }
  return out;
}

// Format an ISO date as a carved-in-stone year, e.g. "SINCE THE YEAR 2023".
export function foundingYear(createdAt) {
  if (!createdAt) return null;
  const y = createdAt.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

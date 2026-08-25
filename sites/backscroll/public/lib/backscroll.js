// backscroll.js — walk every moot's entire app.bsky.feed.getAuthorFeed back
// to its last page (the oldest posts the AppView still serves for them), and
// merge everybody's history into one chronological scroll starting at the
// very beginning. Everything here reads Bluesky's PUBLIC AppView anonymously
// (api.bsky.app, CORS *, no auth) — same as sites/mootpocalypse/public/lib/moots.js
// and sites/feedwalk/public/lib/follows.js. No OAuth needed: a mutual-follow
// graph and everyone's posts are public data.

const PUB = "https://api.bsky.app/xrpc";

// A full walk-to-the-end is one request per ~100 posts, per moot — cap both
// dimensions so a handle with a huge pool or a moot with a huge archive can't
// turn one page load into thousands of requests. Both caps are surfaced in
// the UI (truncated flags) rather than silently dropped.
export const POOL_CAP = 25; // at most this many moots get walked
const PAGE_CAP = 30; // at most this many pages (~3000 posts) per moot
const CONCURRENCY = 4; // simultaneous moots being walked

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < 12; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Mutual follows for `did` (widened to plain follows if too few mutuals to
// bother with). Trimmed from sites/mootpocalypse/public/lib/moots.js.
export async function moots(did, { onStep } = {}) {
  if (onStep) onStep("mapping who you follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows you back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  const mutualCount = mutuals.length;
  let kind = "moots";
  const pool = mutuals.slice();
  if (pool.length < 6) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "moots + follows";
  }

  return {
    did,
    pool,
    kind,
    counts: { follows: follows.length, followers: followers.length, mutuals: mutualCount, pool: pool.length },
  };
}

// One post as we render it, in "genuinely from them" terms: skip reposts
// (reason present — it's not their content), keep replies (still their
// words). Text-only or with images; quote posts keep their embedded text.
function postOf(profile, item) {
  const post = item.post;
  if (!post || item.reason) return null;
  const rec = post.record || {};
  const text = rec.text || "";
  const images = [];
  const embed = post.embed;
  const imgs =
    (embed?.$type === "app.bsky.embed.images#view" && embed.images) ||
    (embed?.$type === "app.bsky.embed.recordWithMedia#view" &&
      embed.media?.$type === "app.bsky.embed.images#view" &&
      embed.media.images) ||
    [];
  for (const im of imgs) images.push({ thumb: im.thumb, alt: im.alt || "" });
  if (!text.trim() && !images.length) return null;
  return {
    uri: post.uri,
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    avatar: profile.avatar,
    text,
    images,
    isReply: !!rec.reply,
    createdAt: rec.createdAt || post.indexedAt || "",
  };
}

// Walk one moot's author feed all the way to the end (oldest page the
// AppView still serves), or PAGE_CAP pages, whichever comes first. Returns
// posts oldest-first.
async function walkOne(profile, { onPage } = {}) {
  const out = [];
  let cursor = "";
  let truncated = false;
  for (let p = 0; p < PAGE_CAP; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", profile.did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      const post = postOf(profile, item);
      if (post) out.push(post);
    }
    cursor = d.cursor;
    if (onPage) onPage();
    if (!cursor) {
      out.reverse(); // page order is newest→oldest; whole array is now oldest→newest
      return { posts: out, truncated: false };
    }
  }
  out.reverse();
  return { posts: out, truncated: true };
}

// Walk every moot in `pool` (capped to POOL_CAP), CONCURRENCY at a time,
// merging results into one oldest→newest array as each moot finishes.
// Calls onProgress({done, total, pages, posts}) after every page fetched so
// the caller can show a live counter.
export async function walkAll(pool, { onProgress } = {}) {
  const capped = pool.slice(0, POOL_CAP);
  const poolTruncated = pool.length > capped.length;

  const perMoot = new Map(); // did -> posts[] (oldest→newest), filled in as walks finish
  const truncatedMoots = [];
  let done = 0;
  let pages = 0;
  let posts = 0;

  const report = () => {
    if (onProgress) onProgress({ done, total: capped.length, pages, posts });
  };
  report();

  let next = 0;
  async function worker() {
    while (next < capped.length) {
      const profile = capped[next++];
      const { posts: found, truncated } = await walkOne(profile, {
        onPage: () => { pages++; report(); },
      });
      perMoot.set(profile.did, found);
      posts += found.length;
      if (truncated) truncatedMoots.push(profile);
      done++;
      report();
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, capped.length) }, worker);
  await Promise.all(workers);

  // k-way merge: every per-moot array is already oldest→newest.
  const merged = [];
  const idx = new Array(capped.length).fill(0);
  const arrays = capped.map((p) => perMoot.get(p.did) || []);
  for (;;) {
    let bestI = -1;
    let bestT = null;
    for (let i = 0; i < arrays.length; i++) {
      if (idx[i] >= arrays[i].length) continue;
      const t = arrays[i][idx[i]].createdAt;
      if (bestT === null || (t && t < bestT)) {
        bestT = t;
        bestI = i;
      }
    }
    if (bestI === -1) break;
    merged.push(arrays[bestI][idx[bestI]]);
    idx[bestI]++;
  }

  return {
    posts: merged,
    poolTruncated,
    poolSize: pool.length,
    walkedCount: capped.length,
    truncatedMoots,
  };
}

export function postUrl(uri, handle) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

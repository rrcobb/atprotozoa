// backscroll.js — for every moot, download their ENTIRE repo in one shot
// (com.atproto.sync.getRepo, see lib/car.js) and pull out every
// app.bsky.feed.post record, then merge everybody's history into one
// chronological scroll starting at the very beginning. The mutual-follow
// graph still comes from Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth) — same as sites/mootpocalypse/public/lib/moots.js and
// sites/feedwalk/public/lib/follows.js — but a moot's post history is read
// straight from their own PDS instead of paginating
// app.bsky.feed.getAuthorFeed a page at a time. No OAuth needed: a
// mutual-follow graph, a repo, and everyone's posts are all public data.
//
// Changed 2026-08-25 at @cee.wtf's request ("stop using paginated listrecord
// calls... stop being afraid of just loading a ton of data"): the old
// version walked getAuthorFeed with a cursor, capped at PAGE_CAP pages per
// moot. A repo download gets a moot's whole history in one request, so that
// cap is gone for the common case — it only survives as a fallback for a
// moot whose repo can't be downloaded (huge PDS-side repo, non-CORS PDS,
// malformed CAR), where the old paginated walk still applies.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";

// The moot POOL is the one dimension we still cap deliberately: someone with
// thousands of mutuals could otherwise turn one page load into thousands of
// full-repo downloads. The cap is surfaced in the UI (poolTruncated) rather
// than silently dropped.
export const POOL_CAP = 1000; // at most this many moots get walked
const PAGE_CAP = 30; // fallback-only: pages of the paginated feed walk, if a moot's repo download fails
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

// Blob-ref-to-CDN-URL, for images pulled off a raw repo record (a CAR record's
// image.ref is CID bytes with a leading 0x00 identity-multibase byte, not the
// resolved thumb URL an AppView-hydrated feed item would carry). Copied from
// sites/activitygrid/public/index.html, which worked this out first.
const B32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function cidBytesToString(bytes) {
  const raw = bytes[0] === 0 ? bytes.subarray(1) : bytes;
  return "b" + base32Encode(raw);
}
function blobThumbUrl(did, refBytes) {
  if (!(refBytes instanceof Uint8Array)) return null;
  return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cidBytesToString(refBytes)}@jpeg`;
}

// Pulls image blobs out of a raw record's embed, however it's shaped: a
// plain app.bsky.embed.images, or images riding along as the media half of a
// recordWithMedia (a quote post with attached photos).
function imagesFromEmbed(did, embed) {
  if (!embed) return [];
  let imagesEmbed = null;
  if (embed.$type === "app.bsky.embed.images") imagesEmbed = embed;
  else if (embed.$type === "app.bsky.embed.recordWithMedia" && embed.media?.$type === "app.bsky.embed.images") {
    imagesEmbed = embed.media;
  }
  if (!imagesEmbed || !Array.isArray(imagesEmbed.images)) return [];
  return imagesEmbed.images
    .map((im) => {
      const thumb = blobThumbUrl(did, im.image?.ref);
      return thumb ? { thumb, alt: im.alt || "" } : null;
    })
    .filter(Boolean);
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

// One post as read straight off a raw repo record (app.bsky.feed.post) —
// same shape as postOf() above, minus the profile/reason fields a hydrated
// AppView feed item carries that a raw record doesn't. Reposts never show up
// here in the first place: they're a distinct collection
// (app.bsky.feed.repost), so there's no `reason` field to filter on.
function postOfRecord(profile, uri, rec) {
  const text = rec.text || "";
  const images = imagesFromEmbed(profile.did, rec.embed);
  if (!text.trim() && !images.length) return null;
  return {
    uri,
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    avatar: profile.avatar,
    text,
    images,
    isReply: !!rec.reply,
    createdAt: rec.createdAt || "",
  };
}

// Primary path: download the moot's whole repo as one CAR and pull every
// app.bsky.feed.post record out of it — one request gets their entire
// history, not just however many pages PAGE_CAP allows. Throws (network
// error, no PDS found, oversize/malformed CAR) so the caller can fall back
// to walkOneViaFeed.
async function walkOneViaRepo(profile, { onPage } = {}) {
  const pds = await resolvePds(profile.did);
  if (!pds) throw new Error(`no PDS found for ${profile.handle}`);
  const { records } = await fetchRepoRecordsWithKeys(pds, profile.did, "app.bsky.feed.post");
  if (onPage) onPage();
  const out = [];
  for (const { uri, value } of records) {
    const post = postOfRecord(profile, uri, value);
    if (post) out.push(post);
  }
  // MST in-order walk yields ascending rkey order, which for TID-keyed posts
  // is already oldest→newest — but sort explicitly rather than trust that a
  // record's rkey timestamp always agrees with its own createdAt field.
  out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return { posts: out, truncated: false };
}

// Fallback path (repo download failed): walk one moot's author feed via the
// AppView, all the way to the end (oldest page it still serves) or PAGE_CAP
// pages, whichever comes first. Returns posts oldest-first.
async function walkOneViaFeed(profile, { onPage } = {}) {
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

// Walk one moot's whole post history: try the one-shot repo download first,
// fall back to the paginated feed walk only if that fails.
async function walkOne(profile, { onPage } = {}) {
  try {
    return await walkOneViaRepo(profile, { onPage });
  } catch {
    return await walkOneViaFeed(profile, { onPage });
  }
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

// ghosts.js — find the mutuals who haven't liked, replied to, or reposted any
// of an account's posts in the last N days.
//
//  - Own posts and the follow list come from ONE com.atproto.sync.getRepo
//    download (lib/car.js, copied from sites/backscroll). The follow records
//    in the repo are the exact "who I follow" list; no getFollows walk.
//  - Followers come from Constellation (lib/microcosm.js, read to exhaustion).
//  - Mutuals = follows ∩ followers.
//  - Engagement per post (likes, reposts, direct replies) comes from
//    Constellation backlinks. A post whose reads keep failing is counted in
//    `failedPosts` so the UI can say the ghost list may be too generous.
//  - If the repo download fails (non-CORS PDS, oversize, bad CAR) the
//    AppView's getAuthorFeed / getFollows are walked to exhaustion instead.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";
import { followerDids, likerDids, reposterDids, replyRecords } from "./microcosm.js";

const PUB = "https://public.api.bsky.app/xrpc";

// Concurrent Constellation requests. A courtesy to a third-party service and
// the browser's per-host connection limit, not a data cap.
const CONCURRENCY = 8;
const RETRIES = 2;
// Backstop for the AppView fallback walks only (100/page → 100,000 items).
const MAX_APPVIEW_PAGES = 1000;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function cleanHandle(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

export async function resolveDid(actor) {
  const a = cleanHandle(actor);
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function fetchProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    followersCount: p.followersCount || 0,
    followingCount: p.followsCount || 0,
  };
}

// Posts newer than `cutoffMs`, and every followed DID, from the repo CAR.
async function readRepo(did, cutoffMs, onStep) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("no PDS found");
  const { records } = await fetchRepoRecordsWithKeys(
    pds,
    did,
    ["app.bsky.feed.post", "app.bsky.graph.follow"],
    onStep,
  );
  const posts = [];
  const follows = new Set();
  for (const { uri, value } of records) {
    if (value.$type === "app.bsky.graph.follow") {
      if (value.subject) follows.add(value.subject);
    } else {
      const t = Date.parse(value.createdAt);
      if (t >= cutoffMs) posts.push({ uri, createdAt: t });
    }
  }
  return { posts, follows };
}

// Fallback: AppView walks, to exhaustion. The author-feed walk stops once it
// is past the window (the feed is newest-first), which is the point of the
// window, not a cap.
async function readAppView(did, cutoffMs, onStep) {
  const posts = [];
  let cursor = "";
  for (let p = 0; p < MAX_APPVIEW_PAGES; p++) {
    onStep(`reading posts… (${posts.length} in window)`);
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_with_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u);
    let inWindow = 0;
    for (const f of d.feed || []) {
      const post = f.post;
      if (!post || post.author?.did !== did || f.reason) continue; // skip reposts
      const t = Date.parse(post.record?.createdAt || post.indexedAt);
      if (t >= cutoffMs) {
        posts.push({ uri: post.uri, createdAt: t });
        inWindow++;
      }
    }
    cursor = d.cursor;
    // Newest-first, so a page with nothing in the window means we're past it.
    // (A pinned old post can sit at the top of page one, so judge per page.)
    if (!cursor || !(d.feed || []).length || inWindow === 0) break;
  }

  const follows = new Set();
  cursor = "";
  for (let p = 0; p < MAX_APPVIEW_PAGES; p++) {
    onStep(`reading follows… (${follows.size} so far)`);
    const u = new URL(`${PUB}/app.bsky.graph.getFollows`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u);
    for (const f of d.follows || []) follows.add(f.did);
    cursor = d.cursor;
    if (!cursor || !(d.follows || []).length) break;
  }
  return { posts, follows };
}

async function withRetry(fn) {
  let err;
  for (let i = 0; i <= RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw err;
}

// Run `fn` over `items` with at most CONCURRENCY in flight.
async function pool(items, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// Everything the analysis needs, as plain data. `onStep(msg, frac?)` drives
// the progress UI.
export async function analyze(did, days, onStep) {
  const cutoffMs = Date.now() - days * 86400000;

  onStep("downloading repo…");
  let repo;
  let usedRepo = true;
  try {
    repo = await readRepo(did, cutoffMs, (m) => onStep(m));
  } catch {
    usedRepo = false;
    repo = await readAppView(did, cutoffMs, (m) => onStep(m));
  }
  const { posts, follows } = repo;

  onStep("reading followers…");
  const followers = await followerDids(did, { onStep: (n) => onStep(`reading followers… (${n})`) });
  const followerSet = new Set(followers);
  const mutuals = [...follows].filter((d) => d !== did && followerSet.has(d));

  const engaged = new Set();
  let failedPosts = 0;
  let done = 0;
  await pool(posts, async (post) => {
    try {
      const [likes, reposts, replies] = await Promise.all([
        withRetry(() => likerDids(post.uri)),
        withRetry(() => reposterDids(post.uri)),
        withRetry(() => replyRecords(post.uri)),
      ]);
      for (const d of likes) engaged.add(d);
      for (const d of reposts) engaged.add(d);
      for (const r of replies) engaged.add(r.did);
    } catch {
      failedPosts++;
    }
    done++;
    onStep(`checking who engaged… (post ${done} of ${posts.length})`, done / posts.length);
  });

  const ghostDids = mutuals.filter((d) => !engaged.has(d));
  return {
    postCount: posts.length,
    followCount: follows.size,
    mutualCount: mutuals.length,
    engagedCount: mutuals.length - ghostDids.length,
    ghostDids,
    failedPosts,
    usedRepo,
  };
}

// Profiles for display, 25 per getProfiles call. Deactivated/suspended
// accounts come back missing and are returned in `gone`.
export async function hydrate(dids, onStep) {
  const out = [];
  for (let i = 0; i < dids.length; i += 25) {
    if (onStep) onStep(`loading profiles… (${Math.min(i + 25, dids.length)} of ${dids.length})`);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of dids.slice(i, i + 25)) u.searchParams.append("actors", d);
    try {
      const d = await jget(u);
      for (const p of d.profiles || []) {
        out.push({
          did: p.did,
          handle: p.handle,
          displayName: p.displayName || p.handle,
          avatar: p.avatar || "",
        });
      }
    } catch {}
  }
  return out;
}

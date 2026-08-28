// subject.js — pulls one Bluesky account's real, live, PUBLIC data (bio,
// avatar, banner, pinned post, real recent posts, real follows/followers,
// account age) plus a small pool of unrelated "decoy" accounts with their
// own real bios/avatars/posts, so a quiz can ask honest questions like
// "which of these is actually their bio" without inventing anything.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth). Adapted and widened from simclustered's lib/graph.js
// (itself from moots.js / simclash / toroidarium / moot-bingo) — that one
// only needed the follow graph; this one also needs profile content and
// posts, since the quiz here is about a fixed subject's real public
// footprint, not the quiz-taker's own graph. (copy, don't abstract)

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)
const DECOY_COUNT = 6;

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
// formats — copied from graph.js's resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

const liteProfileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

const fullProfileOf = (p) => ({
  ...liteProfileOf(p),
  description: p.description || "",
  banner: p.banner || "",
  followersCount: p.followersCount || 0,
  followsCount: p.followsCount || 0,
  postsCount: p.postsCount || 0,
  createdAt: p.createdAt || null,
  pinnedPostUri: (p.pinnedPost && p.pinnedPost.uri) || null,
});

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return fullProfileOf(p);
}

// Real, non-reply, non-repost posts for an account: [{ text, createdAt }].
export async function getPosts(did, limit = 20) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("filter", "posts_no_replies");
  let d;
  try {
    d = await jget(u.toString());
  } catch {
    return [];
  }
  const out = [];
  for (const it of d.feed || []) {
    if (it.reason) continue; // skip reposts
    const rec = it.post && it.post.record;
    const text = rec && rec.text && rec.text.trim();
    if (text && text.length >= 12) out.push({ text, createdAt: rec.createdAt, uri: it.post.uri });
  }
  return out;
}

export async function getPostText(uri) {
  if (!uri) return null;
  try {
    const d = await jget(`${PUB}/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
    const rec = d.posts && d.posts[0] && d.posts[0].record;
    const text = rec && rec.text && rec.text.trim();
    return text || null;
  } catch {
    return null;
  }
}

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
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
    for (const it of d[key] || []) out.push(liteProfileOf(it));
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// A handful of real, stable, well-known Bluesky accounts to pad the decoy
// pool when a subject's own graph is too sparse to supply enough real
// unrelated accounts on its own.
const FALLBACK_HANDLES = ["bsky.app", "jay.bsky.team", "pfrazee.com"];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(arr, n) {
  return shuffle(arr).slice(0, Math.max(0, n));
}

// Load one full subject: profile content + real recent posts + real follow
// graph + a small pool of unrelated decoy accounts (each with their own
// real bio/avatar/one real post), for building honest wrong answers.
export async function loadSubject(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("reading their profile…");
  const profile = await getProfile(did);

  if (onStep) onStep("pulling their real recent posts…");
  const [posts, pinnedText] = await Promise.all([
    getPosts(did, 20),
    getPostText(profile.pinnedPostUri),
  ]);

  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followDids = new Set(follows.map((f) => f.did));
  const followerDids = new Set(followers.map((f) => f.did));
  const moots = [];
  const followsOnly = [];
  for (const f of follows) {
    if (f.did === did) continue;
    if (followerDids.has(f.did)) moots.push(f);
    else followsOnly.push(f);
  }
  const followedByOnly = followers.filter((f) => f.did !== did && !followDids.has(f.did));

  if (onStep) onStep("rounding up some unrelated accounts…");
  const relatedPool = sample([...followsOnly, ...followedByOnly], DECOY_COUNT);
  const candidateHandles = [
    ...relatedPool.map((p) => p.did),
    ...FALLBACK_HANDLES,
  ];
  const decoys = [];
  const usedDids = new Set([did]);
  for (const h of candidateHandles) {
    if (decoys.length >= DECOY_COUNT) break;
    try {
      const decoyDid = h.startsWith("did:") ? h : await resolveDid(h);
      if (usedDids.has(decoyDid)) continue;
      const p = await getProfile(decoyDid);
      const dPosts = await getPosts(decoyDid, 5);
      usedDids.add(decoyDid);
      decoys.push({ ...p, posts: dPosts });
    } catch {}
  }

  return {
    did,
    profile,
    posts,
    pinnedText,
    follows,
    followers,
    moots,
    followsOnly,
    followedByOnly,
    decoys,
  };
}

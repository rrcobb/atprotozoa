// cluster.js — turn a Bluesky handle into its "moots" (mutuals, widened to
// follows if too small). Everything reads Bluesky's PUBLIC AppView
// anonymously (api.bsky.app, CORS *, no auth). Copied verbatim from
// pacmoot/lib/cluster.js, itself trimmed from mootdrone, clustercrawl,
// simcluster — copy, don't abstract. getRecentPosts() is new here: mootcraft
// is the first site in the lineage that needs actual post content (text +
// likeCount), not just the moots graph.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)
const MIN_POOL = 6; // below this, widen mutuals → follows so the board isn't empty

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
// formats — copied from neighborhood/hood.js resolveDid.
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
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
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
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle to its cluster: { did, handle, self, pool, kind, counts }.
// `pool` is moots (mutuals) without self, widened to plain follows if the
// mutual set is too small to stock a board.
export async function moots(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  let self = {
    did,
    handle: actor.replace(/^@/, ""),
    displayName: actor.replace(/^@/, ""),
    avatar: "",
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
  } catch {}

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
  if (pool.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "moots + follows";
  }

  return {
    did,
    handle: self.handle,
    self,
    pool,
    kind,
    counts: {
      follows: follows.length,
      followers: followers.length,
      mutuals: mutualCount,
      pool: pool.length,
    },
  };
}

// Batch-fetch full profiles (bio text + counts) for up to 25 DIDs at a time —
// app.bsky.actor.getProfiles caps at 25 actors per call.
export async function getProfiles(dids) {
  const out = [];
  for (let i = 0; i < dids.length; i += 25) {
    const chunk = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of chunk) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.push(p);
    } catch {}
  }
  return out;
}

// Recent standalone posts (no replies/reposts) for one DID, trimmed to just
// what an ore block needs: text, likeCount, uri, when. One getAuthorFeed
// call per moot — only meant to be called for the handful of accounts that
// made it into a world, not a whole pool.
export async function getRecentPosts(did, limit = 8) {
  try {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", String(Math.min(30, limit * 2)));
    u.searchParams.set("filter", "posts_no_replies");
    const d = await jget(u.toString());
    const out = [];
    for (const item of d.feed || []) {
      const post = item.post;
      if (!post || item.reason) continue; // skip reposts
      const text = (post.record && post.record.text) || "";
      if (!text.trim()) continue; // skip image-only/empty posts, need text to show
      out.push({
        uri: post.uri,
        text,
        likeCount: post.likeCount || 0,
        createdAt: (post.record && post.record.createdAt) || "",
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

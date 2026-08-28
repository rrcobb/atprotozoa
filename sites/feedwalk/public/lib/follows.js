// follows.js — turn a Bluesky handle into "posts from people you follow",
// for the feedwalk gallery. Everything reads Bluesky's PUBLIC AppView
// anonymously (api.bsky.app, CORS *, no auth) — no OAuth login needed,
// unlike app.bsky.feed.getTimeline (which needs a signed-in session). A
// person's follows list and everyone's recent posts are public reads, so we
// get "posts from people you follow" the same way skyclone's logged-out
// mode gets "the public Discover feed": straight AppView calls.
//
// Adapted from sites/mootcraft/public/lib/cluster.js (itself from
// pacmoot/mootdrone/clustercrawl/simcluster — copy, don't abstract).
// Differences from cluster.js: this keeps the *full* follows list (no
// mutuals-only narrowing — the brief is "people you follow", not moots),
// and getRecentPosts here keeps image embeds (a gallery needs pictures).

const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)

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
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function graphAll(endpoint, key, did, maxPages) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < maxPages; p++) {
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

// Resolve a handle to { did, handle, self, follows, counts }. `follows` is
// the account's full follows list (not narrowed to mutuals), self excluded.
export async function whoTheyFollow(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who they follow…");
  const raw = await graphAll("app.bsky.graph.getFollows", "follows", did, GRAPH_PAGES);

  let self = {
    did,
    handle: actor.replace(/^@/, ""),
    displayName: actor.replace(/^@/, ""),
    avatar: "",
  };
  try {
    const prof = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    self = profileOf(prof);
  } catch {}

  const seen = new Set([did]);
  const follows = [];
  for (const f of raw) {
    if (seen.has(f.did)) continue;
    seen.add(f.did);
    follows.push(profileOf(f));
  }

  return { did, handle: self.handle, self, follows, counts: { follows: follows.length } };
}

// Batch-fetch full profiles for up to 25 DIDs at a time (AppView caps
// getProfiles at 25 actors per call).
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

// Recent standalone posts (no replies/reposts) for one account, kept as
// exhibit material: text, image embeds, like/repost counts, when. One
// getAuthorFeed call per followed account — only ever called for the
// handful of accounts a given gallery load picks.
export async function getRecentPosts(profile, limit = 6) {
  try {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", profile.did);
    u.searchParams.set("limit", String(Math.min(30, limit * 3)));
    u.searchParams.set("filter", "posts_no_replies");
    const d = await jget(u.toString());
    const out = [];
    for (const item of d.feed || []) {
      const post = item.post;
      if (!post || item.reason) continue; // skip reposts, keep it "from them"
      const text = (post.record && post.record.text) || "";
      const images = [];
      const embed = post.embed;
      const imgs =
        (embed?.$type === "app.bsky.embed.images#view" && embed.images) ||
        (embed?.$type === "app.bsky.embed.recordWithMedia#view" &&
          embed.media?.$type === "app.bsky.embed.images#view" &&
          embed.media.images) ||
        [];
      for (const im of imgs) images.push({ thumb: im.thumb, alt: im.alt || "" });
      if (!text.trim() && !images.length) continue; // nothing to show
      out.push({
        uri: post.uri,
        did: profile.did,
        handle: profile.handle,
        displayName: profile.displayName,
        avatar: profile.avatar,
        text,
        images,
        likeCount: post.likeCount || 0,
        repostCount: post.repostCount || 0,
        createdAt: (post.record && post.record.createdAt) || "",
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

// rkey out of an at:// post uri, for building a bsky.app profile/post link.
export function postUrl(uri, handle) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

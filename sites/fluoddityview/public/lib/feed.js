// feed.js — pulls real posts from Bluesky's public AppView (public.api.bsky.app,
// CORS *, no auth) and normalizes them to what app.js needs to swarm each
// one: author line, post text, and a context line (timestamp + counts).
// Two sources: the public "what's hot" discover feed (default), or a single
// account's own posts via getAuthorFeed when someone types a handle.
// Pattern copied from sites/bsky95/public/app.js and sites/bottomcoded/public/lib/feed.js.

const PUB = "https://public.api.bsky.app/xrpc";
const DISCOVER_FEED = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const PAGE_SIZE = 15; // browser-canvas guard: each post spins up 2 live particle canvases

async function xrpc(method, params) {
  const url = new URL(`${PUB}/${method}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).message || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

export function cleanHandle(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function normalize(feedItem) {
  const post = feedItem.post;
  const rec = post && post.record;
  if (!post || !rec || typeof rec.text !== "string" || !rec.text.trim()) return null;
  const author = post.author || {};
  const name = author.displayName || author.handle || "someone";
  return {
    uri: post.uri,
    handle: author.handle,
    name,
    text: rec.text.trim(),
    context: `@${author.handle} · ${timeAgo(rec.createdAt || post.indexedAt)} · ♥ ${post.likeCount || 0} · ⟲ ${post.repostCount || 0}`,
    link: bskyLink(post.uri, author.handle),
  };
}

export function bskyLink(uri, handle) {
  const m = (uri || "").match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${handle || m[1]}/post/${m[2]}`;
}

// The default view: whatever's popular right now, nobody's own feed.
export async function fetchDiscoverPosts() {
  const data = await xrpc("app.bsky.feed.getFeed", { feed: DISCOVER_FEED, limit: PAGE_SIZE });
  return (data.feed || []).map(normalize).filter(Boolean);
}

// One account's own words (skips reposts, keeps replies).
export async function fetchAuthorPosts(rawHandle) {
  const handle = cleanHandle(rawHandle);
  if (!handle) throw new Error("enter a handle first");
  const did = handle.startsWith("did:")
    ? handle
    : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
  if (!did) throw new Error(`couldn't resolve "${handle}"`);
  const data = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: PAGE_SIZE * 2 });
  const posts = (data.feed || [])
    .filter((item) => !item.reason) // skip reposts, keep this person's own words
    .map(normalize)
    .filter(Boolean)
    .slice(0, PAGE_SIZE);
  if (!posts.length) throw new Error(`@${handle} has no text posts to show`);
  return posts;
}

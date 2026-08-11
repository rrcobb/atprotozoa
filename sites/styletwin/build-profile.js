// Bakes cee.wtf's own style profile into public/data/cee-profile.json — the
// baseline every visitor's account gets compared against.
//
// Re-fetching and re-analyzing cee's whole post history (2000+ posts, ~25
// pages of getAuthorFeed) on every visitor's page load would be slow and
// wasteful for a baseline that changes slowly. So this runs by hand instead,
// same pattern as og-gen.mjs: a build-time script, not a request-time one.
// Re-run it to refresh the baseline as cee keeps posting:
//
//   node build-profile.js
//
// House style: self-contained, copy-don't-abstract, no secrets (this only
// hits the public, unauthenticated AppView).

const fs = require("node:fs");
const path = require("node:path");
const engine = require("./public/lib/style-engine.js");

const HANDLE = "cee.wtf";
const API = "https://public.api.bsky.app/xrpc/";
const MAX_PAGES = 30;

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""));
  if (!res.ok) throw new Error(`${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllPosts(did) {
  const posts = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    const data = await xrpc("app.bsky.feed.getAuthorFeed", params);
    for (const item of data.feed || []) {
      if (item.reason) continue; // repost, not their own words
      const post = item.post;
      if (!post || !post.record || post.author?.did !== did) continue;
      posts.push({ text: post.record.text || "", createdAt: post.record.createdAt, isReply: !!post.record.reply });
    }
    cursor = data.cursor;
    process.stderr.write(`page ${page + 1}: ${posts.length} posts so far\n`);
    if (!cursor || !data.feed || !data.feed.length) break;
  }
  return posts;
}

async function main() {
  const identity = await xrpc("com.atproto.identity.resolveHandle", { handle: HANDLE });
  const did = identity.did;
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  const posts = await fetchAllPosts(did);
  const analysis = engine.analyze(posts);

  const out = {
    handle: profile.handle,
    did,
    displayName: profile.displayName || profile.handle,
    avatar: profile.avatar || null,
    generatedAt: new Date().toISOString(),
    sampleSize: posts.length,
    ...analysis,
  };

  const outPath = path.join(__dirname, "public", "data", "cee-profile.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error(`wrote ${outPath} (${posts.length} posts analyzed)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

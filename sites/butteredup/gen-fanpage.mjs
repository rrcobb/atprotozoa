// Precomputes public/fan-data.json — a highlight reel of @croissanthology.com's
// public Bluesky posts, baked ahead of time instead of fetched per visitor.
// Same "static snapshot, re-run by hand" pattern as
// sites/simcluster-atlas/gen-atlas.mjs.
//
// Pulls his full recent author feed from the public AppView (no auth), scores
// each of his own posts (not reposts/replies-into-thread noise weighting) by
// likes + 2*reposts + 0.5*replies, keeps the top N as "best tweets" and
// separately the best N posts that carry images for the gallery.
//
// Re-run by hand to refresh the page:
//   node gen-fanpage.mjs   # writes ./public/fan-data.json

import { writeFileSync } from "node:fs";

const PUB = "https://public.api.bsky.app/xrpc";
const SUBJECT = "croissanthology.com";
const MAX_PAGES = 12; // ~1200 posts, generous safety valve
const TOP_POSTS = 18;
const TOP_IMAGE_POSTS = 24;

async function jget(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status === 429 && i < tries - 1) {
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
      continue;
    }
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
}

function postUrl(handle, uri) {
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

async function main() {
  const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${SUBJECT}`);

  let cursor;
  const seen = new Set();
  const posts = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `${PUB}/app.bsky.feed.getAuthorFeed?actor=${SUBJECT}&limit=100` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const d = await jget(url);
    const feed = d.feed || [];
    for (const item of feed) {
      const p = item.post;
      if (p.author.handle !== SUBJECT) continue; // skip reposts of others
      if (seen.has(p.uri)) continue;
      seen.add(p.uri);
      const record = p.record || {};
      const likes = p.likeCount || 0;
      const reposts = p.repostCount || 0;
      const replies = p.replyCount || 0;
      const embed = p.embed || {};
      const images = [];
      if (embed.$type === "app.bsky.embed.images#view") {
        for (const img of embed.images || []) {
          images.push({ thumb: img.thumb, fullsize: img.fullsize, alt: img.alt || "" });
        }
      }
      posts.push({
        url: postUrl(p.author.handle, p.uri),
        text: record.text || "",
        createdAt: record.createdAt || p.indexedAt,
        likes,
        reposts,
        replies,
        score: likes + reposts * 2 + replies * 0.5,
        images,
        isReply: !!record.reply,
      });
    }
    cursor = d.cursor;
    if (!cursor || !feed.length) break;
  }

  const ranked = [...posts].sort((a, b) => b.score - a.score);
  const topPosts = ranked.slice(0, TOP_POSTS);
  const topImagePosts = ranked.filter((p) => p.images.length).slice(0, TOP_IMAGE_POSTS);

  const out = {
    generatedAt: new Date().toISOString(),
    subject: {
      did: profile.did,
      handle: profile.handle,
      displayName: profile.displayName || profile.handle,
      avatar: profile.avatar || null,
      banner: profile.banner || null,
      description: profile.description || "",
      followersCount: profile.followersCount || 0,
      followsCount: profile.followsCount || 0,
      postsCount: profile.postsCount || 0,
    },
    scanned: posts.length,
    topPosts,
    topImagePosts,
  };

  writeFileSync(new URL("./public/fan-data.json", import.meta.url), JSON.stringify(out, null, 2));
  console.log(
    `wrote public/fan-data.json — ${posts.length} posts scanned, ${topPosts.length} top posts, ${topImagePosts.length} image posts`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

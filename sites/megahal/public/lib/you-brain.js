// Fetches a real Bluesky account's own posts via the public AppView and
// turns them into MegaHAL training lines — the "you" brain. Same idea as
// the pastiche brains in brains.js, except the corpus is somebody's actual
// voice instead of hand-written flavor text. Copy of the read pattern in
// sites/spellclash/public/lib/atproto.js, trimmed to just what a feed pull
// needs (no profile fetch).

const PUB = "https://public.api.bsky.app/xrpc";

function normalizeActor(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Pages through app.bsky.feed.getAuthorFeed collecting original-post text
// (no reposts, no replies) until it has `maxPosts` lines or runs out of feed.
// Page budget scales with maxPosts (100 raw items/page, some of which are
// replies/reposts we discard) plus slack, capped so a huge maxPosts can't
// turn into an unbounded sequential-fetch loop against someone's account.
export async function fetchAuthorLines(actor, maxPosts = 3000, onPage) {
  const handle = normalizeActor(actor);
  if (!handle) throw new Error("empty handle");
  const lines = [];
  let cursor;
  const pageBudget = Math.min(60, Math.ceil(maxPosts / 100) + 4);
  for (let page = 0; page < pageBudget && lines.length < maxPosts; page++) {
    const url = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    url.searchParams.set("actor", handle);
    url.searchParams.set("limit", "100");
    url.searchParams.set("filter", "posts_no_replies");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await jget(url.toString());
    for (const item of data.feed || []) {
      if (item.reason) continue; // skip reposts, keep only the account's own words
      const text = item.post && item.post.record && item.post.record.text;
      if (text && text.trim()) lines.push(text.trim());
    }
    if (onPage) onPage(lines.length, page + 1);
    cursor = data.cursor;
    if (!cursor || !(data.feed && data.feed.length)) break;
  }
  if (!lines.length) throw new Error("no posts found");
  return lines.slice(0, maxPosts);
}

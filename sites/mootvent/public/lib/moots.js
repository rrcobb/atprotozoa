// moots.js — turn a Bluesky handle into (a) its moots (mutual follows) and
// (b) a pile of candidate "gift" photos: images posted by those moots,
// ranked by like count. mootvent hands the top-liked ones out behind doors.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getAuthorFeed.
// graphAll/moots() copied and trimmed from sites/moot-bingo/public/lib/moots.js
// (copy, don't abstract).

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — see notes/40-new-site-playbook.md's family fix, 2026-08-28

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

// Resolve a handle to its moots (mutual follows).
export async function moots(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  let self = { did, handle: actor.replace(/^@/, ""), displayName: actor.replace(/^@/, ""), avatar: "" };
  try {
    const prof = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
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

  return { did, handle: self.handle, self, pool: mutuals };
}

// Run `fn` over `items` with at most `limit` in flight at once — a genuine
// browser-concurrency cap (not a coverage cap: every item still runs, this
// just paces how many requests fire at the same instant).
async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i).catch(() => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Pull each moot's most-liked recent image post. One getAuthorFeed call per
// moot (their recent feed, not a full-history walk — this is "find their best
// photo lately," not "read everything they've ever posted," so a single page
// is the right tool, not a bulk repo download).
async function bestImagePostFor(actor) {
  let feed;
  try {
    feed = await jget(
      `${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor.did)}&limit=100&filter=posts_with_media`,
    );
  } catch {
    return [];
  }
  const out = [];
  for (const item of feed.feed || []) {
    const post = item.post;
    const embed = post && post.embed;
    const images =
      (embed && embed.$type === "app.bsky.embed.images#view" && embed.images) ||
      (embed &&
        embed.$type === "app.bsky.embed.recordWithMedia#view" &&
        embed.media &&
        embed.media.$type === "app.bsky.embed.images#view" &&
        embed.media.images) ||
      [];
    for (const img of images) {
      out.push({
        url: img.fullsize || img.thumb,
        alt: img.alt || "",
        likeCount: post.likeCount || 0,
        postUri: post.uri,
        authorHandle: actor.handle,
        authorDisplayName: actor.displayName,
      });
    }
  }
  return out;
}

// Gather candidate gift photos across a pool of moots, ranked by like count.
// No cap on how many moots get examined — a big mutual list just takes
// longer, it doesn't get truncated (see notes/40-new-site-playbook.md,
// "question every cap"). Concurrency is capped only to be polite to the
// browser/network, not to shrink coverage.
export async function harvestPhotos(pool, { onProgress } = {}) {
  let done = 0;
  const perMoot = await mapLimited(pool, 8, async (actor) => {
    const r = await bestImagePostFor(actor);
    done++;
    if (onProgress) onProgress(done, pool.length);
    return r;
  });
  const all = perMoot.filter(Boolean).flat();
  const seenUrls = new Set();
  const deduped = [];
  for (const p of all) {
    if (!p.url || seenUrls.has(p.url)) continue;
    seenUrls.add(p.url);
    deduped.push(p);
  }
  deduped.sort((a, b) => b.likeCount - a.likeCount);
  return deduped;
}

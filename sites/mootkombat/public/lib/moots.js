// moots.js — turn a Bluesky handle into a "moot ladder": its moots (mutuals
// — follows ∩ followers), sorted smallest-followers-first up to its BIGGEST
// moot as the final boss. Backfills followersCount via getProfiles batches
// (getFollows/getFollowers entries rarely carry it) and picks each ladder
// fighter's "hit tweet" (their highest-liked text post) for the pre-fight
// taunt. Reads Bluesky's PUBLIC AppView anonymously (public.api.bsky.app,
// CORS *, no auth): resolveHandle, getProfile, getFollows, getFollowers,
// getProfiles, getAuthorFeed.
//
// Copied+trimmed from thunderdome/lib/thunderdome.js and
// moot-bingo/lib/moots.js; followersCount backfill folded in from
// immortals/immortal.js. (copy, don't abstract.)

const PUB = "https://public.api.bsky.app/xrpc";

const GRAPH_PAGES = 10; // ≤ ~1000 follows / followers scanned for moots
const COUNT_CAP = 200; // backfill followersCount for at most this many moots
const LADDER_SIZE = 7; // fighters on the ladder, biggest moot always last
const FEED_PAGES = 2; // ≤ ~200 posts scanned per fighter for a taunt

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
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
  followersCount:
    typeof p.followersCount === "number" ? p.followersCount : null,
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

// moots = follows ∩ followers.
async function findMoots(did) {
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );
  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const out = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    out.push(profileOf(f));
  }
  return out;
}

// getProfiles takes ≤25 actors/call. Fill followersCount in place for (at
// most) the first COUNT_CAP moots so the ladder sorts on real numbers.
async function backfillCounts(list, onStep) {
  const targets = list.slice(0, COUNT_CAP);
  for (let i = 0; i < targets.length; i += 25) {
    const batch = targets.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const p of batch) u.searchParams.append("actors", p.did);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      continue;
    }
    const byDid = new Map((d.profiles || []).map((pr) => [pr.did, pr]));
    for (const p of batch) {
      const pr = byDid.get(p.did);
      if (pr && typeof pr.followersCount === "number") {
        p.followersCount = pr.followersCount;
      }
    }
    if (onStep)
      onStep(`sizing up the moots… ${Math.min(i + 25, targets.length)}`);
  }
}

function postUrl(handle, uri) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// A fighter's "hit tweet": their highest-liked original text post, for the
// pre-fight taunt bubble.
async function fetchHitTweet(did, fallbackHandle) {
  let best = null;
  let cursor = "";
  for (let pg = 0; pg < FEED_PAGES; pg++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      if (item.reason) continue; // skip reposts — we want THEIR words
      const post = item.post;
      const text = post?.record?.text;
      if (!text || !text.trim()) continue;
      const likeCount = post.likeCount || 0;
      if (!best || likeCount > best.likeCount) {
        const author = post.author || {};
        const handle = author.handle || fallbackHandle;
        best = { text: text.trim(), url: postUrl(handle, post.uri), likeCount };
      }
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return best;
}

// picks LADDER_SIZE fighters spread across the sorted-by-followers moot
// list, ascending, always ending on the single biggest moot (final boss).
// Each bucket picks a random moot from within its (still-ascending) slice
// rather than a fixed evenly-spaced index, so re-rolling the same handle
// gives a different ladder lineup each run while keeping the difficulty
// curve intact.
function pickLadder(sorted) {
  if (sorted.length <= LADDER_SIZE) return sorted;
  const boss = sorted[sorted.length - 1];
  const rest = sorted.slice(0, -1);
  const bucketCount = LADDER_SIZE - 1;
  const picks = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = Math.floor((i * rest.length) / bucketCount);
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * rest.length) / bucketCount));
    const idx = lo + Math.floor(Math.random() * (hi - lo));
    picks.push(rest[Math.min(idx, rest.length - 1)]);
  }
  // de-dupe adjacent repeats from small rest lists
  const dedup = [];
  for (const p of picks) {
    if (!dedup.length || dedup[dedup.length - 1].did !== p.did) dedup.push(p);
  }
  return [...dedup, boss];
}

// Build the moot ladder for a handle. Returns:
//   { self, ladder: [{did,handle,displayName,avatar,followersCount,
//                      difficulty, taunt}], mootCount }
export async function buildLadder(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("pulling up your fighter card…");
  let self = {
    did,
    handle: cleanHandle(actor),
    displayName: cleanHandle(actor),
    avatar: "",
    followersCount: 0,
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = {
      did,
      handle: prof.handle,
      displayName: prof.displayName || prof.handle,
      avatar: prof.avatar || "",
      followersCount: prof.followersCount || 0,
    };
  } catch {}

  if (onStep) onStep("scouting your moots…");
  const moots = await findMoots(did);
  if (!moots.length) {
    throw new Error(`@${self.handle} has no moots to challenge`);
  }

  if (onStep) onStep("sizing up the moots…");
  await backfillCounts(moots, onStep);

  const sorted = moots
    .filter((m) => typeof m.followersCount === "number")
    .sort((a, b) => a.followersCount - b.followersCount);
  const pool = sorted.length ? sorted : moots;
  const picks = pickLadder(pool);

  if (onStep) onStep("scouting trash talk…");
  const selfLog = Math.log10((self.followersCount || 0) + 1);
  const ladder = await Promise.all(
    picks.map(async (m) => {
      const mootLog = Math.log10((m.followersCount || 0) + 1);
      // difficulty 0..1, log-scaled: a moot with 10x your followers sits
      // mid-ladder, 1000x+ tops it out. moots smaller than you start easy.
      const diff = mootLog - selfLog;
      const difficulty = Math.max(0, Math.min(1, (diff + 1) / 3));
      let taunt = null;
      try {
        taunt = await fetchHitTweet(m.did, m.handle);
      } catch {}
      return {
        ...m,
        difficulty,
        taunt: taunt || {
          text: "…",
          url: null,
          likeCount: 0,
        },
      };
    }),
  );

  return { self, ladder, mootCount: moots.length };
}

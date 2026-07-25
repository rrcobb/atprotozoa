// thunderdome.js — turn a Bluesky handle into two rosters of skeets for the
// arena: the handle's own posts, and a pool pulled from a handful of its
// moots (mutuals). Also holds the match math: odds, and a weighted-random
// best-of-3 sim. Reads Bluesky's PUBLIC AppView anonymously
// (public.api.bsky.app, CORS *, no auth): resolveHandle, getProfile,
// getFollows, getFollowers, getAuthorFeed. Graph logic copied+trimmed from
// moot-bingo/lib/moots.js; feed logic copied+trimmed from
// immortals/lib/immortal.js. (copy, don't abstract.)

const PUB = "https://public.api.bsky.app/xrpc";

const GRAPH_PAGES = 8; // ≤ ~800 follows / followers scanned for moots
const FEED_PAGES = 2; // ≤ ~200 posts per account scanned for skeets
const CHALLENGERS = 8; // how many random moots we draw a challenger roster from

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Normalize whatever someone pasted into a bare handle/DID token.
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
  return follows.filter((f) => followerDids.has(f.did));
}

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function postUrl(handle, uri) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// Pull an account's original, text-bearing posts (no replies, no reposts).
async function fetchSkeets(did, fallbackHandle) {
  const out = [];
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
      const author = post.author || {};
      const handle = author.handle || fallbackHandle;
      out.push({
        text,
        uri: post.uri,
        url: postUrl(handle, post.uri),
        likeCount: post.likeCount || 0,
        author: {
          did,
          handle,
          displayName: author.displayName || handle,
          avatar: author.avatar || "",
        },
      });
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Build the two arena rosters for a handle: their own skeets ("yours"), and
// a pooled roster of skeets from a handful of random moots ("moots").
// Returns { self, yours, moots, mootCount }.
export async function buildArena(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("pulling up the fighter's file…");
  let self = {
    did,
    handle: cleanHandle(actor),
    displayName: cleanHandle(actor),
    avatar: "",
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
    };
  } catch {}

  if (onStep) onStep("gathering your skeets…");
  const yours = await fetchSkeets(did, self.handle);
  if (!yours.length) {
    throw new Error(`@${self.handle} has no text skeets to throw in the pit`);
  }

  if (onStep) onStep("scouting the moots…");
  const moots = await findMoots(did);
  if (!moots.length) {
    throw new Error(`@${self.handle} has no moots to challenge`);
  }

  const picks = shuffle(moots).slice(0, CHALLENGERS);
  if (onStep) onStep(`raiding ${picks.length} moots' feeds…`);
  const rosters = await Promise.all(
    picks.map((m) => fetchSkeets(m.did, m.handle).catch(() => [])),
  );
  const mootPosts = rosters.flat();
  if (!mootPosts.length) {
    throw new Error("couldn't find any moot skeets — try a different handle");
  }

  return { self, yours, moots: mootPosts, mootCount: moots.length };
}

// ── the match math ──────────────────────────────────────────────────────

// Single-game win probability for A vs B, Laplace-smoothed so a 0-like post
// still has a fighting chance instead of a guaranteed loss.
export function gameProb(likesA, likesB) {
  return (likesA + 1) / (likesA + likesB + 2);
}

// Best-of-3 (first to 2 wins) match probability for A, given the single-game
// win prob p — i.e. P(win ≥ 2 of 3).
export function matchProb(p) {
  return p * p * (3 - 2 * p);
}

// Play out a best-of-3 with single-game win prob p for "a". Returns
// { winner: "a"|"b", games: ["a"|"b", ...] } — 2 or 3 entries.
export function playMatch(p) {
  const games = [];
  let a = 0,
    b = 0;
  while (a < 2 && b < 2) {
    const win = Math.random() < p;
    games.push(win ? "a" : "b");
    if (win) a++;
    else b++;
  }
  return { winner: a === 2 ? "a" : "b", games };
}

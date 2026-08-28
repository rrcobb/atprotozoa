// cluster.js — turn a Bluesky handle into its "moots" (mutuals, widened to
// follows if too small), then enrich each with a zodiac sign (derived from
// account creation date) and a 48h posting-activity count. Everything reads
// Bluesky's PUBLIC AppView anonymously (api.bsky.app, CORS *, no auth).
// Moots-graph core copied from mootrider/lib/cluster.js, itself trimmed from
// pacmoot/lib/cluster.js, itself from mootdrone/clustercrawl/simcluster —
// copy, don't abstract. The zodiac + activity bits are new for moottris.

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

// Batch-fetch full profiles (bio text, createdAt, counts) for up to 25 DIDs
// at a time — app.bsky.actor.getProfiles caps at 25 actors per call.
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

// ---- zodiac: 12 signs → 7 classical-planet rulers → 7 tetromino shapes ----
// The seven classical (pre-telescope) planets each rule one or two signs;
// that's exactly seven, one per tetromino shape. Account-creation date
// stands in for a "birthday" since that's the only date the AppView gives us.
const SIGNS = [
  { name: "Capricorn", glyph: "♑", from: [12, 22], to: [1, 19] },
  { name: "Aquarius", glyph: "♒", from: [1, 20], to: [2, 18] },
  { name: "Pisces", glyph: "♓", from: [2, 19], to: [3, 20] },
  { name: "Aries", glyph: "♈", from: [3, 21], to: [4, 19] },
  { name: "Taurus", glyph: "♉", from: [4, 20], to: [5, 20] },
  { name: "Gemini", glyph: "♊", from: [5, 21], to: [6, 20] },
  { name: "Cancer", glyph: "♋", from: [6, 21], to: [7, 22] },
  { name: "Leo", glyph: "♌", from: [7, 23], to: [8, 22] },
  { name: "Virgo", glyph: "♍", from: [8, 23], to: [9, 22] },
  { name: "Libra", glyph: "♎", from: [9, 23], to: [10, 22] },
  { name: "Scorpio", glyph: "♏", from: [10, 23], to: [11, 21] },
  { name: "Sagittarius", glyph: "♐", from: [11, 22], to: [12, 21] },
];

const PLANET_OF = {
  Capricorn: "Saturn",
  Aquarius: "Saturn",
  Pisces: "Jupiter",
  Aries: "Mars",
  Taurus: "Venus",
  Gemini: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Virgo: "Mercury",
  Libra: "Venus",
  Scorpio: "Mars",
  Sagittarius: "Jupiter",
};

// planet → tetromino shape + the color that piece renders in
export const PLANET_SHAPE = {
  Sun: { shape: "O", color: "#ffb454" },
  Moon: { shape: "I", color: "#cdd6ff" },
  Mercury: { shape: "S", color: "#8affc1" },
  Venus: { shape: "T", color: "#ff9ecf" },
  Mars: { shape: "Z", color: "#ff6d5f" },
  Jupiter: { shape: "L", color: "#c792ff" },
  Saturn: { shape: "J", color: "#7fa8ff" },
};

function inRange(md, from, to) {
  const f = from[0] * 100 + from[1];
  const t = to[0] * 100 + to[1];
  if (f <= t) return md >= f && md <= t;
  return md >= f || md <= t; // Capricorn wraps New Year
}

// createdAt (ISO string) → { sign, glyph, planet, shape, color }. Falls back
// to Capricorn/Saturn (the wrap-around sign) if the date is missing/bad, so
// callers always get a renderable piece.
export function zodiacOf(createdAt) {
  const d = createdAt ? new Date(createdAt) : null;
  if (!d || Number.isNaN(d.getTime())) {
    const planet = "Saturn";
    return { sign: "Capricorn", glyph: "♑", planet, ...PLANET_SHAPE[planet] };
  }
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const s = SIGNS.find((s) => inRange(md, s.from, s.to)) || SIGNS[0];
  const planet = PLANET_OF[s.name];
  return { sign: s.name, glyph: s.glyph, planet, ...PLANET_SHAPE[planet] };
}

// Count of standalone posts (not reposts) a DID has made in the last 48h.
// One getAuthorFeed call, meant to be called only for the handful of
// accounts that made it onto the board — pattern borrowed from
// mootdrone/lib/cluster.js's postingActivity, swapped for a hard count over
// a fixed window instead of a density score.
export async function postsIn48h(did) {
  try {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    const d = await jget(u.toString());
    const cutoff = Date.now() - 48 * 3600 * 1000;
    let n = 0;
    for (const it of d.feed || []) {
      if (it.reason) continue; // skip reposts, only count authored posts
      const t = Date.parse(it.post?.record?.createdAt || "");
      if (!Number.isNaN(t) && t >= cutoff) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

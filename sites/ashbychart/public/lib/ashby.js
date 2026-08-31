// ashby.js — the properties an Ashby chart plots people by, plus encode/decode
// of a whole chart definition into a URL-safe string (config IS the id, same
// trick as sites/polcompass's compass.js: no server storage, a /c/<encoded>/
// link renders identically for anyone).
//
// Property choice is the fraught part of an "Ashby chart for people" (as
// @jurph.bsky.social flagged when suggesting this) — real Ashby charts plot
// engineering properties like stiffness-per-density, which are objective and
// nobody's feelings are attached to them. So this sticks to plain public
// counts atproto already exposes on every profile: followers, follows, posts,
// and two ratios derived from them. Nothing about taste, behavior, or worth.

export const PROPS = {
  followers: { label: "followers", short: "followers" },
  following: { label: "following", short: "following" },
  posts: { label: "posts", short: "posts" },
  ratio: { label: "followers per following", short: "follower ratio" },
  postsPerDay: { label: "posts per day since profile created", short: "posts/day" },
};

export const PROP_KEYS = Object.keys(PROPS);

// A profile record's own createdAt is the closest public proxy for "when this
// account joined" — atproto has no separate account-creation timestamp on the
// public profile view. It underestimates for anyone who set a display name or
// avatar well after signing up, so this is labelled "since profile created",
// not "account age", everywhere it's shown.
export function computeStats(profile) {
  const followers = profile.followersCount || 0;
  const following = profile.followsCount || 0;
  const posts = profile.postsCount || 0;
  const ratio = followers / Math.max(1, following);
  const ageDays = profile.createdAt ? (Date.now() - Date.parse(profile.createdAt)) / 86400000 : null;
  const postsPerDay = ageDays && ageDays > 1 ? posts / ageDays : null;
  return { followers, following, posts, ratio, postsPerDay };
}

export function propValue(stats, key) {
  return stats[key];
}

function toB64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Handles are capped at 40 — not a data-safety cap (each is one cheap
// getProfile call, no pagination involved) but a chart-legibility one: past
// that many labeled points a scatter plot stops being readable.
const MAX_HANDLES = 40;

export function encodeChart(cfg) {
  const compact = {
    t: cfg.title || "",
    x: cfg.x,
    y: cfg.y,
    xl: cfg.xLog ? 1 : 0,
    yl: cfg.yLog ? 1 : 0,
    h: (cfg.handles || []).slice(0, MAX_HANDLES),
  };
  return toB64Url(new TextEncoder().encode(JSON.stringify(compact)));
}

export function decodeChart(encoded) {
  const json = new TextDecoder().decode(fromB64Url(encoded));
  const o = JSON.parse(json);
  const x = PROP_KEYS.includes(o.x) ? o.x : "followers";
  const y = PROP_KEYS.includes(o.y) ? o.y : "posts";
  if (!Array.isArray(o.h)) throw new Error("no handles");
  return {
    title: String(o.t || "").slice(0, 80),
    x,
    y,
    xLog: !!o.xl,
    yLog: !!o.yl,
    handles: o.h
      .slice(0, MAX_HANDLES)
      .map((h) => String(h).trim().replace(/^@/, ""))
      .filter(Boolean),
  };
}

export async function chartFingerprint(encoded) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encoded));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Points not beaten on both axes at once by any other point — the classic
// Ashby "selection line": nobody on this list is strictly worse than another
// point in the set on both properties. Sorted by x ascending, only the
// non-dominated points survive, in frontier order (for drawing a polyline).
export function paretoFrontier(points) {
  const sorted = [...points].sort((a, b) => b.x - a.x);
  const frontier = [];
  let bestY = -Infinity;
  for (const p of sorted) {
    if (p.y > bestY) {
      frontier.push(p);
      bestY = p.y;
    }
  }
  return frontier.sort((a, b) => a.x - b.x);
}

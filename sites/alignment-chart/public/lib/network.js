// network.js — turn a Bluesky handle into a plottable network: its people
// (mutuals, widened to plain follows) plus each one's WHOLE post history, then
// run a deliberately silly heuristic to place everyone on a D&D-style
// alignment grid.
//
// AXES (it's a bit, not a classifier):
//   x = CHILL ←→ HARSH     (soft/cozy vibes vs. beef/dunks/rage)
//   y = MOGGING (top) ←→ GOONING (bottom)   (locked-in/grinding vs. down-bad/horny)
//
// Graph (mutuals/follows) still reads Bluesky's PUBLIC AppView anonymously
// (public.api.bsky.app, CORS *, no auth): resolveHandle, getFollows,
// getFollowers, getProfile. Copied+trimmed from moot-bingo/lib/moots.js
// (copy, don't abstract).
//
// Changed 2026-08-28 at @antiali.as's request ("don't just read a handful of
// posts, you can do the whole CARs"): the vibe read used to be one page of
// getAuthorFeed (FEED_POSTS=20). Per the bot's standing bulk-reads order
// (builder/INSTRUCTIONS.md, @cee.wtf's 2026-08-25 thread: prefer one
// com.atproto.sync.getRepo CAR download over a paginated walk), each
// account's text now comes from a single repo download — every post they've
// ever made, not a 20-post sample — via lib/car.js + lib/identity.js (copied
// from sites/backscroll, the reference impl). Falls back to the old one-page
// getAuthorFeed read only if the repo download fails (no PDS found,
// oversize/malformed CAR, non-CORS PDS).

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://public.api.bsky.app/xrpc";

const GRAPH_PAGES = 8; // ≤ ~800 follows + ~800 followers scanned for mutuals
const MIN_POOL = 12; // below this, widen mutuals → follows so a grid has bodies
const MAX_PLOT = 60; // hard cap on accounts we fetch repos for (keeps it fast)
const FEED_POSTS = 100; // fallback-only: getAuthorFeed page size if the repo download fails

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
// formats — copied from moot-bingo/lib/moots.js resolveDid.
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

// Page through a graph endpoint (getFollows / getFollowers), collecting the
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays fast.
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

// Resolve a handle to the pool of accounts we'll plot (self + network).
// Returns { did, self, pool, kind, counts } — pool is WITHOUT self; self gets
// plotted separately so "you" stands out on the grid.
export async function networkPool(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
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
  const seen = new Set([did]); // never let self slip into the pool
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

// ── Starter packs / lists as an alternate input ─────────────────────────
// Instead of a handle's network, you can plot a starter pack or list's whole
// membership. Accepts an AT-URI (list or starter pack), a bsky.app starter
// pack link, or a bsky.app list link. Returns null if `raw` isn't shaped like
// any of those, so callers can fall back to treating it as a handle.
async function resolveListInput(raw) {
  const s = (raw || "").trim();
  let m;
  if (/^at:\/\/[^/]+\/app\.bsky\.graph\.list\/[^/]+$/.test(s)) {
    return { listUri: s };
  }
  if (/^at:\/\/[^/]+\/app\.bsky\.graph\.starterpack\/[^/]+$/.test(s)) {
    return { spUri: s };
  }
  if ((m = /bsky\.app\/starter-pack\/([^/?#]+)\/([^/?#]+)/.exec(s))) {
    const did = await resolveDid(m[1]);
    return { spUri: `at://${did}/app.bsky.graph.starterpack/${m[2]}` };
  }
  if ((m = /bsky\.app\/profile\/([^/?#]+)\/lists\/([^/?#]+)/.exec(s))) {
    const did = await resolveDid(m[1]);
    return { listUri: `at://${did}/app.bsky.graph.list/${m[2]}` };
  }
  return null;
}

// Page through a list's full membership (no bulk-download equivalent for
// list items, so cursor-walk it — same pattern as graphAll above).
async function listAll(listUri) {
  const out = [];
  let cursor = "";
  let meta = null;
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getList`);
    u.searchParams.set("list", listUri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    if (!meta) {
      meta = {
        name: d.list?.name,
        creator: d.list?.creator ? profileOf(d.list.creator) : null,
      };
    }
    for (const it of d.items || []) if (it.subject) out.push(it.subject);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return { items: out, meta };
}

// Resolve + plot a starter pack or list's membership. Throws if `raw` isn't
// list-shaped — callers should try resolveListInput first (see plot()).
export async function plotList(raw, { onStep, onProgress } = {}) {
  const parsed = await resolveListInput(raw);
  if (!parsed) throw new Error("not a starter pack or list link");

  let listUri = parsed.listUri;
  let title = null;
  let creator = null;

  if (parsed.spUri) {
    if (onStep) onStep("resolving starter pack…");
    const d = await jget(
      `${PUB}/app.bsky.graph.getStarterPack?starterPack=${encodeURIComponent(parsed.spUri)}`,
    );
    const sp = d.starterPack;
    if (!sp) throw new Error("starter pack not found");
    listUri = sp.record?.list || sp.list?.uri;
    title = sp.record?.name || sp.list?.name || "starter pack";
    creator = sp.creator ? profileOf(sp.creator) : null;
  }
  if (!listUri) throw new Error("couldn't find the list behind that starter pack");

  if (onStep) onStep("reading the list…");
  const { items, meta } = await listAll(listUri);
  if (!title) title = meta?.name || "list";
  if (!creator) creator = meta?.creator || null;

  const people = items.map(profileOf).slice(0, MAX_PLOT);
  const plotted = await classifyPeople(people, { onProgress }, null);

  return {
    mode: "list",
    title,
    creator,
    listUri,
    kind: "starter pack",
    counts: { items: items.length },
    plotted,
  };
}

// Fetch each account's post history + classify, with limited concurrency.
// Shared by plotNetwork and plotList. selfDid marks one account as isSelf (or
// null for list mode, where nobody is "you").
async function classifyPeople(people, { onProgress } = {}, selfDid) {
  const total = people.length;
  const out = new Array(total);
  let done = 0;
  const CONC = 4; // repo CAR downloads are heavier than the old feed page, so a bit gentler than before
  let cursor = 0;
  async function worker() {
    while (cursor < people.length) {
      const i = cursor++;
      const p = people[i];
      const text = await feedText(p.did);
      const c = classify(p.did, text);
      out[i] = { ...p, ...c, isSelf: selfDid ? p.did === selfDid : false };
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONC, people.length || 1) }, worker),
  );
  return out;
}

// Try list/starter-pack input first, fall back to treating `raw` as a handle
// and plotting its network. This is the entry point index.html calls.
export async function plot(raw, { onStep, onProgress } = {}) {
  const listInput = await resolveListInput(raw);
  if (listInput) return plotList(raw, { onStep, onProgress });
  return plotNetwork(raw, { onStep, onProgress });
}

// Pull an account's WHOLE post-history text via one repo CAR download —
// their entire app.bsky.feed.post collection, not a page-capped sample.
// Returns a single lowercased blob of their own words (replies excluded, same
// as the old getAuthorFeed posts_no_replies filter — replies are conversation,
// not their unprompted vibe; reposts never show up here since they live in a
// separate collection). Throws on failure so feedText can fall back.
async function feedTextViaRepo(did) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("no PDS found");
  const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post");
  const parts = [];
  for (const { value: rec } of records) {
    if (rec.reply) continue;
    if (rec.text) parts.push(rec.text);
  }
  return parts.join("  \n").toLowerCase();
}

// Fallback-only: one page of recent posts off the public AppView, for an
// account whose repo can't be downloaded (no PDS found, oversize/malformed
// CAR, non-CORS PDS).
async function feedTextViaFeed(did) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", String(FEED_POSTS));
  u.searchParams.set("filter", "posts_no_replies");
  let d;
  try {
    d = await jget(u.toString());
  } catch {
    return "";
  }
  const parts = [];
  for (const item of d.feed || []) {
    // skip reposts: reason present means it's someone else's post
    if (item.reason) continue;
    const t = item.post?.record?.text;
    if (t) parts.push(t);
  }
  return parts.join("  \n").toLowerCase();
}

// Pull post text for one account: whole repo first, one-page feed fallback.
async function feedText(did) {
  try {
    return await feedTextViaRepo(did);
  } catch {
    return await feedTextViaFeed(did);
  }
}

// ── The heuristic (a bit) ─────────────────────────────────────────────────
// Each axis is scored by counting how many "vibe words" show up, then squashed
// to a signed score. Words are chosen for the joke; do not read too hard into it.

// HARSH: beef, dunks, rage, doom, discourse. CHILL: soft, cozy, gentle.
const HARSH = [
  "kill","die","hate","rage","furious","cope","seethe","mald","ratio","dunk",
  "beef","block","clown","idiot","stupid","trash","garbage","cringe","ban",
  "war","fight","destroy","obliterate","💢","😡","🤬","🔪","💀","rant","mad",
  "unhinged","feral","screaming","doom","collapse","fascist","cursed","brutal",
];
const CHILL = [
  "cozy","gentle","soft","calm","peace","peaceful","tea","blanket","nap","cat",
  "dog","plants","garden","tender","kind","grateful","thankful","love you",
  "hug","sweet","vibes","chill","relax","comfy","warm","🥰","😊","☺️",
  "🌸","🫶","💛","🍵","cottage","slow morning","little guy","be kind",
];

// MOGGING (up): locked-in, grinding, winning, gymmaxxing, shipping.
const MOG = [
  "locked in","grind","gym","lift","deadlift","shipped","shipping","built",
  "based","sigma","mog","mogging","gigachad","alpha","discipline","5am","cold shower",
  "protein","gains","dub","cracked","hustle","launch","productive","deep work",
  "focus","optimize","peak","winning","🏋️","💪","🚀","📈","monk mode",
];
// GOONING (down): down bad, horny, coomer, brainrot, degen.
const GOON = [
  "goon","gooning","down bad","horny","coom","edging","rizz","🥵","😩","🍑",
  "🍆","💦","brainrot","degen","freak","milf","dilf","thirst","simp","unwell",
  "obsessed","need him","need her","insane over","losing it","cannot stop",
  "3am thoughts","no thoughts","brain empty","yearning","malewife","femboy",
];

function countHits(text, words) {
  let n = 0;
  for (const w of words) {
    // whole-word-ish for short alnum tokens, substring for phrases/emoji
    if (/^[a-z]+$/.test(w) && w.length <= 4) {
      const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "g");
      n += (text.match(re) || []).length;
    } else {
      let idx = 0;
      while ((idx = text.indexOf(w, idx)) !== -1) {
        n++;
        idx += w.length;
      }
    }
  }
  return n;
}

// Squash a raw (positive - negative) tally into a signed score in (-1, 1).
// tanh-ish without importing anything: k tunes how fast we saturate. A small k
// means even one net keyword hit pushes a fair way off center, so the grid
// actually gets used instead of everyone piling on the origin.
function squash(pos, neg) {
  const net = pos - neg;
  const k = 1.4;
  return net / (Math.abs(net) + k);
}

// A stable-but-varied offset in [-1,1] derived from a DID + salt, so a given
// account always lands in the same spot between runs (no Math.random flicker).
function hashUnit(did, salt) {
  let h = 0;
  const s = did + salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000 * 2 - 1; // -1..1
}

// Classify one account's text blob.
//   x/y: the honest score in [-1,1] — used for the CELL and the roster.
//   px/py: a lightly-jittered PLOT position, so people who score identically
//          (very common at dead center) scatter within their box instead of
//          stacking on one pixel. Jitter is per-DID and deterministic.
//   x: -1 (CHILL) … +1 (HARSH);  y: -1 (GOONING) … +1 (MOGGING)
export function classify(did, text) {
  const empty = !text || text.length < 8;
  const jx = hashUnit(did, "x") * 0.22;
  const jy = hashUnit(did, "y") * 0.22;
  if (empty) {
    // quiet accounts have no read at all — park them in a loose center cloud
    return { x: 0, y: 0, px: jx, py: jy, cell: null, empty: true };
  }
  const x = squash(countHits(text, HARSH), countHits(text, CHILL));
  const y = squash(countHits(text, MOG), countHits(text, GOON));
  const clamp = (v) => Math.max(-0.98, Math.min(0.98, v));
  return { x, y, px: clamp(x + jx), py: clamp(y + jy), cell: cellOf(x, y), empty: false };
}

// 3×3 cell index 0..8 (row-major, row 0 = top = MOGGING). Thresholds at ±1/3.
export function cellOf(x, y) {
  const col = x < -1 / 3 ? 0 : x > 1 / 3 ? 2 : 1; // 0=chill,1=neutral,2=harsh
  const row = y > 1 / 3 ? 0 : y < -1 / 3 ? 2 : 1; // 0=mog,1=neutral,2=goon
  return row * 3 + col;
}

// The nine boxes — a name + tiny flavor line for each, D&D style.
export const CELLS = [
  { name: "Lawful Locked-In", flavor: "chill + mogging: monk-mode but nice about it" },
  { name: "Neutral Grindset", flavor: "keeping the head down, shipping quietly" },
  { name: "Chaotic Mogger", flavor: "harsh + mogging: dunking AND deadlifting" },
  { name: "Lawful Cozy", flavor: "pure chill, tea and plants, no notes" },
  { name: "True Neutral", flavor: "balanced. suspicious. probably a lurker" },
  { name: "Chaotic Discourse", flavor: "harsh + centered: born to post, forced to seethe" },
  { name: "Lawful Yearning", flavor: "chill + gooning: soft and extremely down bad" },
  { name: "Neutral Degen", flavor: "brainrot equilibrium, no thoughts head empty" },
  { name: "Chaotic Goon", flavor: "harsh + gooning: unwell and unafraid to say so" },
];

// Plot the whole pool. Downloads each account's whole post history with
// limited concurrency, classifies each, and returns
// [{ ...profile, x, y, cell, empty, isSelf }]. Reports progress via
// onProgress(done, total).
export async function plotNetwork(actor, { onStep, onProgress } = {}) {
  const net = await networkPool(actor, { onStep });
  const people = [net.self, ...net.pool].slice(0, MAX_PLOT + 1);
  const plotted = await classifyPeople(people, { onProgress }, net.self.did);
  return {
    mode: "network",
    self: net.self,
    kind: net.kind,
    counts: net.counts,
    plotted,
  };
}

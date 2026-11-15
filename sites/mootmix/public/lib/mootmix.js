// mootmix.js — for every moot, download their ENTIRE repo in one shot
// (com.atproto.sync.getRepo, see lib/car.js), pull the music links out of
// every post (link facets, link-card embeds, bare URLs in the text), and
// dedupe them into one playlist. The mutual-follow graph comes from
// Bluesky's PUBLIC AppView anonymously (api.bsky.app, CORS *, no auth).
// Moot-walking copied from sites/backscroll/public/lib/backscroll.js.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";

// The moot POOL is capped deliberately: every moot is a full-repo download,
// so thousands of mutuals would turn one page load into thousands of
// downloads. The cap is surfaced in the UI (poolTruncated), not silent.
export const POOL_CAP = 1000;
// Backstop on the paginated fallback walk (only used when a repo download
// fails); 400 pages x 100 posts is 40k posts, past any real account.
const PAGE_CAP = 400;
const CONCURRENCY = 4; // simultaneous moots being walked

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
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

// GRAPH_PAGE_CAP is a backstop, not a budget — getFollows/getFollowers have
// no bulk-download equivalent, so this still paginates, but the page count
// isn't a correctness bound. Matches the moot-family fix (2026-08-28): this
// inline `12` was an uncaught straggler from the same GRAPH_PAGES=12 bug,
// missed by that sweep because it wasn't a named constant.
const GRAPH_PAGE_CAP = 400;

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGE_CAP; p++) {
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

// Mutual follows for `did` (widened to plain follows if too few mutuals to
// bother with). Trimmed from sites/mootpocalypse/public/lib/moots.js.
export async function moots(did, { onStep } = {}) {
  if (onStep) onStep("mapping who you follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows you back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

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
  if (pool.length < 6) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "moots + follows";
  }

  return {
    did,
    pool,
    kind,
    counts: { follows: follows.length, followers: followers.length, mutuals: mutualCount, pool: pool.length },
  };
}


// ---- music link recognition ------------------------------------------------
// Each recognizer returns { service, key, embed?, label } or null. `key` is
// the dedupe identity; `embed` is an iframe src when the service allows
// embedding by URL alone. Bandcamp/Tidal/Deezer/song.link need a numeric id
// or login to embed, so they play as "open" links.
const SC_RESERVED = new Set(["discover", "stream", "you", "upload", "pages", "terms-of-use", "search", "charts", "feed", "settings", "popular", "tags", "messages", "notifications", "people"]);

export function classify(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" && parts[0]) {
    return yt(parts[0], u.searchParams.get("t") || u.searchParams.get("start"));
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    let id = null;
    if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "live", "embed"].includes(parts[0])) id = parts[1];
    if (id) return yt(id, u.searchParams.get("t"), host === "music.youtube.com");
    return null;
  }
  if (host === "open.spotify.com") {
    const p = parts[0] && parts[0].startsWith("intl-") ? parts.slice(1) : parts;
    if (["track", "album", "playlist", "episode", "show", "artist"].includes(p[0]) && p[1]) {
      return { service: "spotify", key: `spotify:${p[0]}:${p[1]}`, embed: `https://open.spotify.com/embed/${p[0]}/${p[1]}`, label: `spotify ${p[0]}` };
    }
    return null;
  }
  if (host === "soundcloud.com") {
    if (parts.length >= 2 && !SC_RESERVED.has(parts[0])) {
      const clean = `https://soundcloud.com/${parts.join("/")}`;
      return { service: "soundcloud", key: `sc:${parts.join("/").toLowerCase()}`, embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&auto_play=true&visual=true`, label: `soundcloud ${parts[parts.length - 1].replace(/-/g, " ")}` };
    }
    return null;
  }
  if (host === "on.soundcloud.com" && parts[0]) {
    return { service: "soundcloud", key: `sc-short:${parts[0]}`, label: "soundcloud" };
  }
  if (host === "music.apple.com" && parts.length >= 2) {
    const tail = parts.join("/");
    return { service: "apple", key: `apple:${tail.toLowerCase()}${u.searchParams.get("i") ? "?i=" + u.searchParams.get("i") : ""}`, embed: `https://embed.music.apple.com/${tail}${u.search}`, label: "apple music" };
  }
  if (host === "mixcloud.com" && parts.length >= 2 && !["discover", "select", "upload"].includes(parts[0])) {
    const feed = `/${parts.join("/")}/`;
    return { service: "mixcloud", key: `mc:${feed.toLowerCase()}`, embed: `https://www.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(feed)}&autoplay=1`, label: `mixcloud ${parts[parts.length - 1].replace(/-/g, " ")}` };
  }
  if (host.endsWith(".bandcamp.com") && ["track", "album"].includes(parts[0]) && parts[1]) {
    return { service: "bandcamp", key: `bc:${host}/${parts[0]}/${parts[1]}`, label: `bandcamp ${parts[1].replace(/-/g, " ")}` };
  }
  if ((host === "tidal.com" || host === "listen.tidal.com") && parts.length >= 2) {
    return { service: "tidal", key: `tidal:${parts.join("/")}`, label: "tidal" };
  }
  if (host === "deezer.com" && parts.length >= 2) {
    return { service: "deezer", key: `deezer:${parts.join("/")}`, label: "deezer" };
  }
  if (["song.link", "album.link", "odesli.co", "pods.link"].includes(host) && parts.length >= 1) {
    return { service: "song.link", key: `sl:${parts.join("/")}`, label: "song.link" };
  }
  return null;
}

function yt(id, t, isMusic) {
  if (!/^[\w-]{6,20}$/.test(id)) return null;
  const start = t ? parseInt(String(t).replace(/s$/, ""), 10) : 0;
  return { service: "youtube", key: `yt:${id}`, ytId: id, start: Number.isFinite(start) && start > 0 ? start : 0, label: isMusic ? "youtube music" : "youtube" };
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

// Every URL a post carries: link facets (the real href behind truncated
// display text), external link-card embeds, and bare URLs in the text.
function urlsOf(rec) {
  const out = new Set();
  for (const f of rec.facets || []) {
    for (const ft of f.features || []) if (ft.uri) out.add(ft.uri);
  }
  const e = rec.embed;
  if (e) {
    if (e.external?.uri) out.add(e.external.uri);
    if (e.media?.external?.uri) out.add(e.media.external.uri);
  }
  for (const m of (rec.text || "").match(URL_RE) || []) out.add(m.replace(/[.,;:!?]+$/, ""));
  return out;
}

function addPost(found, profile, uri, rec, titleOf) {
  const urls = urlsOf(rec);
  if (!urls.size) return;
  const ext = rec.embed?.external || rec.embed?.media?.external;
  for (const url of urls) {
    const c = classify(url);
    if (!c) continue;
    found.push({
      ...c,
      url,
      title: ext && ext.uri === url && ext.title ? ext.title : "",
      did: profile.did,
      handle: profile.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      postUri: uri,
      text: rec.text || "",
      createdAt: rec.createdAt || "",
    });
  }
}

async function walkOneViaRepo(profile) {
  const pds = await resolvePds(profile.did);
  if (!pds) throw new Error(`no PDS found for ${profile.handle}`);
  const { records } = await fetchRepoRecordsWithKeys(pds, profile.did, "app.bsky.feed.post");
  const found = [];
  for (const { uri, value } of records) addPost(found, profile, uri, value);
  return { found, posts: records.length };
}

// Fallback (repo download failed — oversize, non-CORS PDS, malformed CAR):
// page the AppView author feed to exhaustion.
async function walkOneViaFeed(profile) {
  const found = [];
  let posts = 0;
  let cursor = "";
  for (let p = 0; p < PAGE_CAP; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", profile.did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try { d = await jget(u.toString()); } catch { break; }
    for (const item of d.feed || []) {
      if (item.reason || !item.post) continue; // reposts aren't theirs
      posts++;
      const rec = { ...(item.post.record || {}) };
      if (!rec.embed && item.post.embed?.external) rec.embed = { external: item.post.embed.external };
      addPost(found, profile, item.post.uri, rec);
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return { found, posts };
}

async function walkOne(profile) {
  try { return await walkOneViaRepo(profile); } catch { return await walkOneViaFeed(profile); }
}

// Walk every moot in `pool` (capped to POOL_CAP), CONCURRENCY at a time,
// and fold every music link into a deduped playlist. Each entry keeps its
// first (oldest) share as the headline and every sharer after it.
export async function walkAll(pool, { onProgress } = {}) {
  const capped = pool.slice(0, POOL_CAP);
  const byKey = new Map();
  let done = 0, posts = 0, links = 0;
  const report = (current) => onProgress && onProgress({ done, total: capped.length, posts, links, tracks: byKey.size, current });
  report("");

  let next = 0;
  async function worker() {
    while (next < capped.length) {
      const profile = capped[next++];
      report(profile.handle);
      const { found, posts: n } = await walkOne(profile);
      posts += n;
      links += found.length;
      for (const f of found) {
        let t = byKey.get(f.key);
        if (!t) { t = { ...f, shares: [] }; byKey.set(f.key, t); }
        t.shares.push({ did: f.did, handle: f.handle, displayName: f.displayName, avatar: f.avatar, postUri: f.postUri, text: f.text, createdAt: f.createdAt });
        if (!t.title && f.title) t.title = f.title;
      }
      done++;
      report("");
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, capped.length) }, worker));

  const tracks = [...byKey.values()];
  for (const t of tracks) {
    t.shares.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    t.latest = t.shares[t.shares.length - 1].createdAt;
  }
  return { tracks, poolTruncated: pool.length > capped.length, poolSize: pool.length, walkedCount: capped.length, posts, links };
}

export function postUrl(uri, handle) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

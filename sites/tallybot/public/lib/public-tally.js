import { PointIndex } from "./point-index.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const RE = /^([\s\S]{1,140}?)\s*:?\s*([+-])\s*1\s*$/;

// Two sources feed the same leaderboard: freeform "<name> +1"/"-1" posts,
// sampled from a public AppView search, and net.bisks.tallybot.point records
// signed-in voters write straight to their own PDS — see point-index.js for
// why the latter used to be write-only. One singleton so its Jetstream
// connection and backfill progress persist across every apiFetch() call on
// the page rather than restarting from zero each time.
let pointIndex = null;
function getPointIndex() {
  if (!pointIndex) {
    pointIndex = new PointIndex();
    pointIndex.start();
  }
  return pointIndex;
}

const handleCache = new Map();
async function resolveHandles(dids) {
  const missing = [...new Set(dids)].filter((d) => d && !handleCache.has(d));
  for (let i = 0; i < missing.length; i += 25) {
    const batch = missing.slice(i, i + 25);
    try {
      const qs = batch.map((d) => `actors=${encodeURIComponent(d)}`).join("&");
      const r = await fetch(`${APPVIEW}/app.bsky.actor.getProfiles?${qs}`);
      if (r.ok) {
        const data = await r.json();
        for (const p of data.profiles || []) handleCache.set(p.did, p.handle);
      }
    } catch (_) {
      // A profile-lookup failure just falls back to the bare DID below.
    }
    for (const d of batch) if (!handleCache.has(d)) handleCache.set(d, "");
  }
}

function mergeTally(tallies, key, displayName, score, upCount, downCount, updatedAt) {
  let t = tallies.get(key);
  if (!t) {
    t = { key, displayName, score: 0, upCount: 0, downCount: 0, updatedAt: 0 };
    tallies.set(key, t);
  }
  t.score += score;
  t.upCount += upCount;
  t.downCount += downCount;
  if (updatedAt >= t.updatedAt) {
    t.updatedAt = updatedAt;
    t.displayName = displayName;
  }
}

export async function publicData() {
  const r = await fetch(`${APPVIEW}/app.bsky.feed.searchPosts?q=%2B1&limit=100`); if (!r.ok) throw new Error("AppView unavailable");
  const tallies = new Map(), votes = [];
  for (const post of (await r.json()).posts || []) { const m = RE.exec(String(post.record?.text || "").trim()); if (!m) continue; const displayName = m[1].trim().replace(/\s+/g, " "), key = displayName.toLowerCase(); const delta = m[2] === "+" ? 1 : -1; const createdAt = Date.parse(post.record.createdAt) || Date.now(); mergeTally(tallies, key, displayName, delta, delta > 0 ? 1 : 0, delta > 0 ? 0 : 1, createdAt); votes.push({ key, displayName, delta, voterDid: post.author?.did || "", voterHandle: post.author?.handle || "", postUrl: post.uri || null, createdAt }); }

  const snap = getPointIndex().snapshot();
  for (const t of snap.tallies.values()) mergeTally(tallies, t.key, t.displayName, t.score, t.upCount, t.downCount, t.updatedAt);
  for (const v of snap.votes) votes.push({ ...v, voterHandle: handleCache.get(v.voterDid) || "", postUrl: null });

  const ranked = [...tallies.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)); ranked.forEach((t, i) => { t.rank = i + 1; t.totalRanked = ranked.length; t.votesReceived = t.upCount + t.downCount; });
  votes.sort((a, b) => b.createdAt - a.createdAt);
  return { ranked, votes, tallies };
}

// Handle resolution only runs over whatever slice of votes a caller actually
// asked for (capped at 50 either way), never the full merged history.
async function withHandles(votes) {
  const missing = votes.filter((v) => v.voterDid && !v.voterHandle).map((v) => v.voterDid);
  if (missing.length) await resolveHandles(missing);
  return votes.map((v) => (v.voterHandle ? v : { ...v, voterHandle: handleCache.get(v.voterDid) || "" }));
}

const WINDOW_MS = { "1h": 3600e3, "24h": 86400e3, "7d": 604800e3, "30d": 2592000e3, all: Infinity };

export async function apiFetch(input) {
  const u = new URL(input, location.origin), data = await publicData(), q = u.searchParams.get("q")?.toLowerCase() || "";
  if (u.pathname === "/api/leaderboard") {
    let board = data.ranked.filter((t) => !q || t.displayName.toLowerCase().includes(q));
    const sort = u.searchParams.get("sort") || "top";
    if (sort === "bottom") board = [...board].sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
    else if (sort === "active") board = [...board].sort((a, b) => b.votesReceived - a.votesReceived || b.score - a.score);
    else if (sort === "gainers" || sort === "losers") {
      const windowMs = WINDOW_MS[u.searchParams.get("window")] ?? WINDOW_MS["24h"];
      const cutoff = windowMs === Infinity ? -Infinity : Date.now() - windowMs;
      const deltaByKey = new Map();
      for (const v of data.votes) { if (v.createdAt < cutoff) continue; deltaByKey.set(v.key, (deltaByKey.get(v.key) || 0) + v.delta); }
      board = board.map((t) => ({ ...t, windowDelta: deltaByKey.get(t.key) || 0 })).filter((t) => t.windowDelta !== 0);
      board.sort(sort === "gainers" ? (a, b) => b.windowDelta - a.windowDelta : (a, b) => a.windowDelta - b.windowDelta);
    }
    return new Response(JSON.stringify({ board: board.slice(0, Number(u.searchParams.get("limit") || 50)), total: board.length, totalRanked: data.ranked.length }), { headers: { "content-type": "application/json" } });
  }
  if (u.pathname === "/api/activity") { let votes = data.votes; const key = u.searchParams.get("key"); if (key) votes = votes.filter((v) => v.key === key.toLowerCase()); const sliced = await withHandles(votes.slice(0, Number(u.searchParams.get("limit") || 50))); return new Response(JSON.stringify({ votes: sliced, total: votes.length }), { headers: { "content-type": "application/json" } }); }
  if (u.pathname === "/api/tally") { const key = (u.searchParams.get("key") || "").trim().toLowerCase(), t = data.tallies.get(key); const sliced = await withHandles(data.votes.filter((v) => v.key === key).slice(0, 50)); return new Response(JSON.stringify({ tally: t || { key, displayName: key, score: 0, upCount: 0, downCount: 0, votesReceived: 0 }, votes: sliced }), { headers: { "content-type": "application/json" } }); }
  return new Response(JSON.stringify({ remainingMs: 0 }), { headers: { "content-type": "application/json" } });
}

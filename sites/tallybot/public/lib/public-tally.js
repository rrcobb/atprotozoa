const APPVIEW = "https://public.api.bsky.app/xrpc";
const RE = /^([\s\S]{1,140}?)\s*:?\s*([+-])\s*1\s*$/;
export async function publicData() {
  const r = await fetch(`${APPVIEW}/app.bsky.feed.searchPosts?q=%2B1&limit=100`); if (!r.ok) throw new Error("AppView unavailable");
  const tallies = new Map(), votes = [];
  for (const post of (await r.json()).posts || []) { const m = RE.exec(String(post.record?.text || "").trim()); if (!m) continue; const displayName = m[1].trim().replace(/\s+/g, " "), key = displayName.toLowerCase(); let t = tallies.get(key); if (!t) { t = { key, displayName, score: 0, upCount: 0, downCount: 0, updatedAt: 0 }; tallies.set(key, t); } const delta = m[2] === "+" ? 1 : -1; t.score += delta; t[delta > 0 ? "upCount" : "downCount"]++; t.updatedAt = Date.parse(post.record.createdAt) || Date.now(); votes.push({ key, displayName, delta, voterDid: post.author?.did || "", voterHandle: post.author?.handle || "", postUrl: post.uri || null, createdAt: t.updatedAt }); }
  const ranked = [...tallies.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)); ranked.forEach((t, i) => { t.rank = i + 1; t.totalRanked = ranked.length; t.votesReceived = t.upCount + t.downCount; });
  return { ranked, votes: votes.reverse(), tallies };
}
export async function apiFetch(input) {
  const u = new URL(input, location.origin), data = await publicData(), q = u.searchParams.get("q")?.toLowerCase() || "";
  if (u.pathname === "/api/leaderboard") { let board = data.ranked.filter((t) => !q || t.displayName.toLowerCase().includes(q)); return new Response(JSON.stringify({ board: board.slice(0, Number(u.searchParams.get("limit") || 50)), total: board.length, totalRanked: data.ranked.length }), { headers: { "content-type": "application/json" } }); }
  if (u.pathname === "/api/activity") { let votes = data.votes; const key = u.searchParams.get("key"); if (key) votes = votes.filter((v) => v.key === key.toLowerCase()); return new Response(JSON.stringify({ votes: votes.slice(0, Number(u.searchParams.get("limit") || 50)), total: votes.length }), { headers: { "content-type": "application/json" } }); }
  if (u.pathname === "/api/tally") { const key = (u.searchParams.get("key") || "").trim().toLowerCase(), t = data.tallies.get(key); return new Response(JSON.stringify({ tally: t || { key, displayName: key, score: 0, upCount: 0, downCount: 0, votesReceived: 0 }, votes: data.votes.filter((v) => v.key === key).slice(0, 50) }), { headers: { "content-type": "application/json" } }); }
  return new Response(JSON.stringify({ remainingMs: 0 }), { headers: { "content-type": "application/json" } });
}

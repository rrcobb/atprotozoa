const APPVIEW = "https://public.api.bsky.app/xrpc";
const DELTA_RE = /^(.{1,140}?)\s+(\+\+|--|[+-]\d{1,6})$/;
function parse(text) { const m = DELTA_RE.exec(String(text || "").trim().split("\n").pop().trim()); if (!m) return null; const delta = m[2] === "++" ? 1 : m[2] === "--" ? -1 : Number(m[2]); return delta ? { name: m[1].trim().replace(/\s+/g, " "), delta } : null; }
export async function publicData() {
  const r = await fetch(`${APPVIEW}/app.bsky.feed.searchPosts?q=%2B1&limit=100`); if (!r.ok) throw new Error("AppView unavailable");
  const posts = (await r.json()).posts || [], names = new Map(), feed = [];
  for (const post of posts) { const hit = parse(post.record?.text); if (!hit) continue; const key = hit.name.toLowerCase(); let e = names.get(key); if (!e) { e = { key, display: hit.name, score: 0, posts: 0, lastAt: 0, lastDid: "", lastUri: "" }; names.set(key, e); } e.score += hit.delta; e.posts++; e.lastAt = Date.parse(post.record.createdAt) || Date.now(); e.lastDid = post.author?.did || ""; e.handle = post.author?.handle || ""; e.lastUri = post.uri || ""; feed.push({ key, display: hit.name, delta: hit.delta, newScore: e.score, did: e.lastDid, handle: e.handle, uri: e.lastUri, at: e.lastAt }); }
  const all = [...names.values()], top = [...all].sort((a, b) => b.score - a.score), bottom = [...all].sort((a, b) => a.score - b.score);
  return { updatedAt: Date.now(), totalNames: all.length, totalPosts: feed.length, top: top.slice(0, 30), bottom: bottom.slice(0, 30), recent: feed.slice(-60).reverse(), names };
}

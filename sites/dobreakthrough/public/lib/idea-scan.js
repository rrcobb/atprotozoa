// idea-scan.js — page a fixed handle's whole app.bsky.feed.getAuthorFeed
// history via the public AppView (no auth, no PDS resolution needed — the
// feed view already carries real post text plus engagement counts in one
// call per page) and score each post on how much it reads like a business
// idea.

const APPVIEW = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveProfile(actor) {
  return jget(`${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
}

// A backstop against a runaway loop, not a real limit anyone should hit.
const PAGE_SIZE = 100;

// Pages getAuthorFeed until `maxPosts` is reached or the feed runs out.
// Returns flat post views (feed items with reposts already stripped), newest
// first — the natural order getAuthorFeed returns.
export async function fetchRecentPosts(actor, maxPosts, onProgress) {
  const out = [];
  let cursor;
  while (out.length < maxPosts) {
    const u = new URL(`${APPVIEW}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", actor);
    u.searchParams.set("limit", String(PAGE_SIZE));
    u.searchParams.set("filter", "posts_with_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    const items = d.feed || [];
    for (const item of items) {
      // Only the account's own authored posts — getAuthorFeed can include a
      // reply's parent context but item.post.author is always the account
      // itself for this filter, and we skip reposts (no item.reason).
      if (item.reason) continue;
      out.push(item.post);
      if (out.length >= maxPosts) break;
    }
    if (onProgress) onProgress(Math.min(out.length, maxPosts));
    cursor = d.cursor;
    if (!cursor || !items.length) break;
  }
  return out;
}

// Weighted keyword/phrase signals for "this reads like a pitched business
// idea," tuned by hand against real posts, not an exhaustive NLP model —
// good enough to rank a feed, not to certify anything.
const SIGNALS = [
  [/\bsomeone should (build|make|start|sell)\b/i, 5],
  [/\byou could (build|make|start|sell|charge for)\b/i, 4],
  [/\bwhat if there w?as\b/i, 3],
  [/\bwhy (isn'?t|doesn'?t|hasn'?t|hasn't) there\b/i, 4],
  [/\b(million|billion)[- ]dollar idea\b/i, 6],
  [/\bstartup idea\b/i, 6],
  [/\bapp idea\b/i, 5],
  [/\bproduct idea\b/i, 5],
  [/\bbusiness idea\b/i, 6],
  [/\bi'?d (totally )?pay for\b/i, 4],
  [/\bpeople would (pay|buy)\b/i, 4],
  [/\buntapped market\b/i, 5],
  [/\bthere'?s a market for\b/i, 4],
  [/\bdisrupt\w*\b/i, 3],
  [/\bmvp\b/i, 3],
  [/\bmonetiz\w*\b/i, 4],
  [/\bsaas\b/i, 4],
  [/\bpivot\w*\b/i, 2],
  [/\bpatent this\b/i, 5],
  [/\bturn (this|it) into a (product|business|company)\b/i, 5],
  [/\bgenuinely (could be|is) a (business|company|product)\b/i, 5],
  [/\bsomeone (needs to|should) make\b/i, 5],
  [/\bnew feature\b/i, 1],
  [/\btool that\b/i, 2],
  [/\ban? app that\b/i, 3],
  [/\ba website that\b/i, 2],
  [/\ba platform (for|that)\b/i, 3],
  [/\bfounders?\b/i, 2],
  [/\binvestor\w*\b/i, 3],
  [/\bfunding\b/i, 2],
  [/\brevenue\b/i, 2],
  [/\bsubscription\b/i, 2],
  [/\$\d/, 2],
];

export function scoreIdea(text) {
  const t = String(text || "");
  if (t.trim().length < 8) return 0;
  let score = 0;
  for (const [re, weight] of SIGNALS) if (re.test(t)) score += weight;
  return score;
}

// Ranks posts by idea-ness, keeps the top `limit`. Falls back to whatever
// scored above zero if fewer than `min` posts clear a real threshold, so a
// quiet account still gets a dashboard instead of an empty one.
export function pickBusinessIdeas(posts, { limit = 30, min = 8 } = {}) {
  const scored = posts
    .map((p) => ({ post: p, score: scoreIdea(p.record && p.record.text) }))
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || (b.post.likeCount || 0) - (a.post.likeCount || 0));
  if (scored.length >= min) return scored.slice(0, limit);
  return scored.slice(0, Math.max(limit, min));
}

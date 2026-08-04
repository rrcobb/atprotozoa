// ngmi Worker — ngmi.bisks.net
//
// The real read runs client-side (public/lib/car.js + public/lib/ngmi-analysis.js
// download the account's whole repo CAR and score every post they've ever
// made). The one thing that needs a server: /s/<handle>, a personalized OG
// share URL per handle. A plain static site serves the same index.html no
// matter who's in the query string, so a link-unfurl cache (Bluesky's
// included) shows one generic card for every share, forever — same problem
// sites/didscope and sites/beefcheck solved the same way.
//
// Re-downloading and MST-walking the whole repo CAR server-side on every
// unfurl request would be expensive for what's just a preview card, so this
// runs a SMALL, hand-duplicated subset of the client's heuristics (grift
// language, doomer language, reply ratio, went-dark) over a capped recent
// sample from getAuthorFeed instead of the full repo — good enough for a
// one-line verdict, not the full evidence list. Duplicated, not imported —
// copy-don't-abstract applies within one site too. The client-side app,
// which is what actually renders once someone opens the link, always does
// the full, authoritative whole-repo read.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

const GRIFT_PHRASES = [
  "wagmi", "ngmi", "gm frens", "gm fam", "wen moon", "to the moon",
  "not financial advice", "nfa", "airdrop", "presale", "whitelist spot",
  "diamond hands", "paper hands", "rug pull", "ape in", "few understand",
  "bullish", "bearish", "hopium", "cope and seethe", "wen lambo",
];
const DOOMER_PHRASES = [
  "it's so over", "its so over", "everything is over", "nothing matters",
  "i give up", "i'm cooked", "im cooked", "we're cooked", "were cooked",
  "done with this app", "deleting this app", "quitting bluesky",
];
const BUILD_PHRASES = [
  "shipped", "just launched", "just deployed", "built this", "i built",
  "open sourced", "open-sourced", "pushed to main", "went live",
];

function findPhrase(lowerText: string, phrases: string[]): boolean {
  return phrases.some((p) => lowerText.includes(p));
}

interface SamplePost {
  text: string;
  createdAt: string;
  isReply: boolean;
}

async function sampleRecentPosts(did: string): Promise<SamplePost[]> {
  const out: SamplePost[] = [];
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100", filter: "posts_with_replies" });
  for (const item of feed.feed || []) {
    if (item.reason) continue; // skip reposts
    const record = item.post && item.post.record;
    if (!record || typeof record.text !== "string") continue;
    out.push({ text: record.text, createdAt: record.createdAt || item.post.indexedAt, isReply: !!(record.reply && record.reply.parent) });
  }
  return out;
}

// Small approximation of ngmi-analysis.js's analyze(): a rough score off a
// capped recent-post sample, just enough for a one-line OG description.
function roughScore(posts: SamplePost[], followers: number, following: number): { score: number; label: string } {
  if (!posts.length) return { score: 0, label: "no data" };

  let score = 0;
  const griftHits = posts.filter((p) => findPhrase(p.text.toLowerCase(), GRIFT_PHRASES)).length;
  if (griftHits >= 3) score += 20;
  else if (griftHits >= 1) score += 8;

  const doomHits = posts.filter((p) => findPhrase(p.text.toLowerCase(), DOOMER_PHRASES)).length;
  if (doomHits) score += Math.min(35, 25 + (doomHits - 1) * 5);

  if (posts.length >= 15) {
    const replyRatio = posts.filter((p) => p.isReply).length / posts.length;
    if (replyRatio >= 0.85) score += 15;
    else if (replyRatio <= 0.3) score -= 10;
  }

  if (following >= 150 && following > followers * 3) score += 10;
  else if (followers >= 500 && followers >= following) score -= 10;

  const buildHits = posts.filter((p) => findPhrase(p.text.toLowerCase(), BUILD_PHRASES)).length;
  if (buildHits >= 2) score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 71 ? "certified ngmi" : score >= 46 ? "it's giving ngmi" : score >= 21 ? "probably fine" : "wagmi";
  return { score, label };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "ngmi — are you gonna make it?";
const GENERIC_DESC =
  "Enter a Bluesky handle. ngmi downloads their whole repo straight from their PDS and reads their posting history for grift language, doomer talk, reply-guy ratios, 3am posting, and more — verdict with receipts, not vibes.";
const GENERIC_OG_URL = "https://ngmi.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(rawHandle || "").trim().replace(/^@/, "");
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const posts = await sampleRecentPosts(did);
    const { score, label } = roughScore(posts, profile.followersCount || 0, profile.followsCount || 0);

    const who = "@" + (profile.handle || handle);
    const title = posts.length === 0
      ? `ngmi: ${who} — no posts found`
      : `ngmi: ${who} scored ${score}/100 — ${label}`;
    const desc = truncate(
      posts.length === 0
        ? "No posts found to read for this account. Full read checks their whole repo history."
        : `Read off ${posts.length} recent posts: grift language, doomer talk, reply ratio, follow ratio. Full read checks their entire post history, not just a sample.`,
      300
    );
    const ogUrl = `https://ngmi.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve server-side (typo, deleted account, rate limit) —
    // still serve the live page; the client script surfaces its own error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-handle URL.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};

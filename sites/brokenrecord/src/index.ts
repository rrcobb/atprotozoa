// brokenrecord Worker — brokenrecord.bisks.net
//
// The real analysis runs client-side: public/app.js downloads the target's
// whole repo as one CAR (public/lib/car.js) and clusters their posts against
// each other (public/lib/similarity.js). The one thing that needs a server:
// shared links. A plain static site serves the *same* index.html — same
// og:title/og:description — no matter whose handle is in the query string,
// so Bluesky's link-unfurl cache would show one generic card for every
// share, forever (same problem sites/didscope and sites/beefcheck hit).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side and runs a LIGHTER version of the comparison — a
// single page of getAuthorFeed (not the full CAR; this is a preview, not the
// live result) scored with the same trigram/bigram-overlap heuristic as
// similarity.js, trimmed to just "find the single best-matching pair" — then
// stamps personalized og:title/og:description/og:url onto the page shell.
// Falls through to ASSETS for everything else. The live page always
// recomputes the full, real answer from the full repo on load.

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

// ---- lightweight, preview-only similarity (real thing is public/lib/similarity.js) ----

const LINK_RE = /https?:\/\/\S+/gi;
// Same bare-domain catch as public/lib/similarity.js's stripLinks — see its
// comment for why the TLD needs 2+ letters (keeps "e.g." / "4.5" intact).
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is",
  "it", "this", "that", "with", "as", "at", "by", "be", "was", "were", "are",
  "i", "you", "my", "me", "so", "just", "im", "its", "not", "no", "do", "did",
]);

function stripLinks(text: string): string {
  return text.replace(LINK_RE, " ").replace(BARE_DOMAIN_RE, " ").replace(/\s+/g, " ").trim();
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).filter((t) => t.length > 1);
}

function charTrigrams(text: string): Set<string> {
  const s = text.toLowerCase().replace(/\s+/g, " ");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function quickScore(a: string, b: string): number {
  const ta = charTrigrams(a);
  const tb = charTrigrams(b);
  const wa = new Set(tokens(a).filter((t) => !STOPWORDS.has(t)));
  const wb = new Set(tokens(b).filter((t) => !STOPWORDS.has(t)));
  return Math.round(100 * (0.5 * jaccard(ta, tb) + 0.5 * jaccard(wa, wb)));
}

interface QuickPost {
  text: string;
  createdAt: string;
}

async function fetchQuickPosts(did: string): Promise<QuickPost[]> {
  const data = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100", filter: "posts_no_replies" });
  const out: QuickPost[] = [];
  for (const item of data.feed || []) {
    if (item.reason) continue;
    const post = item.post;
    if (!post || !post.record || post.author?.did !== did) continue;
    const text = stripLinks(post.record.text || "");
    if (!text) continue;
    out.push({ text, createdAt: post.record.createdAt || post.indexedAt });
  }
  return out;
}

function bestPair(posts: QuickPost[]): { score: number; a: QuickPost; b: QuickPost } | null {
  let best: { score: number; a: QuickPost; b: QuickPost } | null = null;
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const score = quickScore(posts[i].text, posts[j].text);
      if (!best || score > best.score) best = { score, a: posts[i], b: posts[j] };
    }
  }
  return best;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return "";
  }
}

const GENERIC_TITLE = "brokenrecord — find out what you keep repeating";
const GENERIC_DESC =
  "Enter a Bluesky handle. brokenrecord downloads their whole repo and clusters their own posts against each other — near-duplicates, paraphrases, reused jokes, opinions, and stories — ranked by how strong the echo is.";
const GENERIC_OG_URL_ATTR = 'content="https://brokenrecord.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) {
      did = handle;
    } else {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const posts = await fetchQuickPosts(did);
    const who = "@" + (profile.handle || handle);
    const pair = posts.length >= 2 ? bestPair(posts) : null;

    let title: string;
    let desc: string;
    if (!pair || pair.score < 25) {
      title = `brokenrecord: ${who} — no strong echoes found`;
      desc = `Checked ${who}'s recent posts for repeats — nothing loud enough to call out yet. Full read checks their whole repo, not just a sample.`;
    } else {
      title = `brokenrecord: ${who}'s strongest echo scores ${pair.score}%`;
      desc = truncate(
        `"${pair.a.text}" (${fmtDate(pair.a.createdAt)}) vs "${pair.b.text}" (${fmtDate(pair.b.createdAt)}) — ${pair.score}% match. Full read checks their whole repo and groups every echo into ranked clusters.`,
        300,
      );
    }
    const ogUrl = `https://brokenrecord.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/measure server-side (typo, deleted account, rate
    // limit, an account with <2 posts) — still serve the live page so the
    // link isn't dead; the client script surfaces its own error/empty state.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};

// bottomcoded Worker — bottomcoded.bisks.net
//
// The scoring itself runs client-side (public/lib/energy.js + feed.js do the
// real work). The one thing that needs a server: shared links. A plain
// static site serves the same index.html — same og:title/description — no
// matter whose handle is in the query string, so a link-unfurl cache shows
// one generic card for every share, forever. Fix: /s/<handle> is a real,
// distinct URL per person; the Worker resolves the handle, computes the same
// bottom↔top score the client does, and stamps personalized
// og:title/og:description/og:url onto the same page shell before serving it.
// Same recipe as sites/didscope/src/index.ts. Falls through to ASSETS for
// everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of public/lib/energy.js's weight tables — server-side
// duplication within ONE site (same reasoning as didscope's SIGNS copy), not
// a shared package across sites. Only what the OG text needs made the trip.
const TOP_SIGNALS: [RegExp, number][] = [
  [/\bi said what i said\b/, 1.6],
  [/\bnot (?:up for debate|negotiable)\b/, 1.3],
  [/\bthe audacity\b/, 0.9],
  [/\bfix (?:it|your(?:self)?)\b/, 1.0],
  [/\bdo better\b/, 1.0],
  [/\bfull stop\b/, 0.9],
  [/\bcouldn'?t be me\b/, 0.7],
  [/\byou will\b/, 0.5],
  [/^no[.,]/, 0.7],
  [/^(?:do|stop|get|move|fix|listen|watch|try|quit)\b/, 0.5],
  [/\bobviously\b/, 0.6],
  [/\bcorrect(?:ly)?\b/, 0.3],
  [/\bactually\b/, 0.25],
  [/\bliterally\b/, 0.25],
];
const BOTTOM_SIGNALS: [RegExp, number][] = [
  [/\bbottom[\s-]?coded\b/, 1.6],
  [/\bouchies?\b/, 1.0],
  [/\bouch\b/, 0.6],
  [/\bno thoughts\b/, 0.6],
  [/\bi can'?t believe i (?:said|did) that\b/, 0.6],
  [/\basking for a friend\b/, 0.5],
  [/\bif that'?s (?:ok|okay|alright)\b/, 0.5],
  [/\bnot to be dramatic but\b/, 0.4],
  [/\bsorry\b/, 0.8],
  [/\bmy bad\b/, 0.6],
  [/\boops\b/, 0.5],
  [/\bi guess\b/, 0.5],
  [/\bkind of\b|\bsort of\b/, 0.3],
  [/\bmaybe\b/, 0.4],
  [/\bidk\b/, 0.4],
  [/^just\b/, 0.3],
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scorePostText(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  const lower = t.toLowerCase();
  let score = 0;
  for (const [re, w] of TOP_SIGNALS) if (re.test(lower)) score += w;
  for (const [re, w] of BOTTOM_SIGNALS) if (re.test(lower)) score -= w;

  const exclaim = (t.match(/!/g) || []).length;
  if (exclaim) score += Math.min(exclaim, 3) * 0.3;
  const questions = (t.match(/\?/g) || []).length;
  if (questions) score -= Math.min(questions, 3) * 0.3;
  if (/(?:\.\.\.|…)\s*$/.test(t)) score -= 0.5;

  const words = t.split(/\s+/).filter(Boolean);
  const shouty = words.filter((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  if (shouty) score += Math.min(shouty, 3) * 0.4;

  return clamp(score, -4, 4);
}

const VERDICTS: { min: number; label: string; blurb: string }[] = [
  { min: 70, label: "certified top", blurb: "no notes, no hedging, pure declarative energy." },
  { min: 40, label: "top-coded", blurb: "mostly statements. rarely a question mark in sight." },
  { min: 15, label: "leaning top", blurb: "switch energy, but takes the lead when it counts." },
  { min: -15, label: "full switch", blurb: "reads either way depending on the thread." },
  { min: -40, label: "leaning bottom", blurb: "switch energy, softer edges." },
  { min: -70, label: "bottom-coded", blurb: "a lot of “sorry,” “maybe,” and “i guess.”" },
  { min: -Infinity, label: "certified bottom", blurb: "and it's giving “oh damn, i didn't realize it was that obvious.”" },
];
function verdictFor(score: number) {
  return VERDICTS.find((v) => score >= v.min)!;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
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

async function scoreLatestPosts(did: string): Promise<{ timeline: number; postCount: number }> {
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100" });
  const texts: string[] = (feed.feed || [])
    .filter((item: any) => !item.reason)
    .map((item: any) => item.post?.record?.text)
    .filter((t: unknown): t is string => typeof t === "string");
  if (!texts.length) return { timeline: 0, postCount: 0 };
  const scores = texts.map(scorePostText);
  const avg = scores.reduce((a, s) => a + s, 0) / scores.length;
  return { timeline: clamp(Math.round(avg * 25), -100, 100), postCount: texts.length };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "bottomcoded — bottom or top posting energy?";
const GENERIC_DESC =
  "Enter a Bluesky handle. We score your last ~100 posts for bottom-to-top posting energy and average it into one number.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (gotcha called out in
// sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://bottomcoded.bisks.net/"';

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
    const { timeline, postCount } = await scoreLatestPosts(did);
    if (!postCount) return new Response(html, { headers: base.headers });

    const verdict = verdictFor(timeline);
    const who = "@" + (profile.handle || handle);
    const title = `bottomcoded: ${who} scores ${timeline > 0 ? "+" : ""}${timeline}/100 — ${verdict.label}`;
    const desc = truncate(`${verdict.blurb} Scored from their last ${postCount} posts.`, 300);
    const ogUrl = `https://bottomcoded.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script surfaces its own "couldn't score that" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};

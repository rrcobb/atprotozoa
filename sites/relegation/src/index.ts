// relegation Worker — relegation.bisks.net
//
// Everything real happens client-side (public/index.html + public/app.js +
// public/lib/*.js): sign in, tally likes+replies given to the signed-in
// account's whole post history, split the tally against moots (relegation
// boards) and non-mutual followers (promotion board). The one thing that
// needed a server: shared results. A plain static site serves the same
// index.html — same og:title/og:description — no matter whose audit ran, so
// sharing a link would unfurl one generic card forever (same issue as
// sites/didscope's notes/45-sharing-and-virality.md, tier 4, and the fix
// sites/innercircle/mootrace/dial-a-mutual already shipped).
//
// Fix: /summary/<handle>/<moots>/<candidates> is a real, distinct URL per
// result. This does NOT re-run any of the expensive scan server-side (reading
// every post's likes+replies is far too slow/costly for a single Worker
// request) — the client already had moots.length/candidates.length before
// building the share link, so the Worker just formats them straight from the
// URL path into the OG tags.
//
// Falls through to ASSETS for everything else (/, /og.png, /lib/*, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's meta tags — these exact strings get swapped for the
// personalized versions. Keep in sync with public/index.html's <head>.
const GENERIC_OG_TITLE = "relegation — who's getting dropped from your mutuals";
const GENERIC_OG_DESC =
  "Sign in with Bluesky. It reads your whole post history and tallies who's actually liked and replied to it, then puts your quietest mutuals in the relegation zone and calls up the followers who out-engage them as replacements.";
const GENERIC_TWITTER_DESC = "Your quietest mutuals, relegated. Your most engaged followers, called up as replacements.";
const GENERIC_OG_URL = "https://relegation.bisks.net/";

async function renderSummary(
  env: Env,
  request: Request,
  rawHandle: string,
  rawMoots: string,
  rawCandidates: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  const moots = Number(rawMoots);
  const candidates = Number(rawCandidates);
  if (!handle || !Number.isFinite(moots) || !Number.isFinite(candidates) || moots < 0 || candidates < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `⬇️ relegation: @${handle} just audited ${moots} moots`;
  const desc = `@${handle} ran their whole post history through relegation — ${moots} moots scanned for who gave the least, ${candidates} non-mutual followers checked for who'd deserve a call-up instead.`;
  const ogUrl = `https://relegation.bisks.net/summary/${encodeURIComponent(handle)}/${moots}/${candidates}`;

  html = html
    .split(GENERIC_OG_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(desc))
    .split(GENERIC_TWITTER_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /summary/<handle>/<moots>/<candidates> — the distinct, shareable,
    // per-result URL. Every result gets its own og:title/description/url so
    // a link unfurler can't collapse different shared audits into one card.
    const m = url.pathname.match(/^\/summary\/([^/]+)\/(\d+)\/(\d+)\/?$/);
    if (m) return renderSummary(env, request, m[1], m[2], m[3]);

    return env.ASSETS.fetch(request);
  },
};

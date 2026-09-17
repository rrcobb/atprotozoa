// labelmuster Worker — labelmuster.bisks.net
//
// Everything real happens client-side (public/index.html + public/lib/*.js
// + public/app.js): scan an account's labels, pick one, and search its
// follows+followers for anyone else carrying it. The one thing that needed
// a server: shared results. A plain static site serves the same index.html
// — same og:title/og:description — no matter whose muster it was, so a
// shared link would unfurl one generic card forever (same gotcha as
// sites/innercircle's src/index.ts, copied here).
//
// Fix: /summary/<handle>/<label>/<count> is a real, distinct URL per
// result. This does NOT re-run the actual scan server-side (that's a live
// follows+followers walk against the public AppView, too slow for a single
// Worker request) — the client already knows the label and match count
// before building the share link, so the Worker just formats them straight
// from the URL path into the OG tags.
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
const GENERIC_OG_TITLE = "labelmuster — find everyone who shares a label";
const GENERIC_OG_DESC =
  "Scan an account's labels, pick one, and muster everyone nearby who carries it too — self-applied flags and moderation labels both.";
const GENERIC_TWITTER_DESC = "Scan an account's labels, pick one, and muster everyone nearby who carries it too.";
// Quoted, not bare — "https://labelmuster.bisks.net/" is also a *prefix* of
// the og:image/twitter:image URLs (".../og.png"), so a bare substring
// replace corrupts those into ".../summary/<handle>/.../og.png". Matching
// the closing quote scopes the replacement to the exact og:url attribute.
const GENERIC_OG_URL = `"https://labelmuster.bisks.net/"`;

async function renderSummary(
  env: Env,
  request: Request,
  rawHandle: string,
  rawLabel: string,
  rawCount: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  const label = decodeURIComponent(rawLabel || "").trim();
  const count = Number(rawCount);
  if (!handle || !label || !Number.isFinite(count) || count < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `🏷️ labelmuster: ${count} account${count === 1 ? "" : "s"} near @${handle} carry "${label}"`;
  const desc =
    count === 0
      ? `Nobody in @${handle}'s follows/followers carries the "${label}" label — yet.`
      : `${count} account${count === 1 ? "" : "s"} in @${handle}'s follows/followers also carry the "${label}" label. Muster your own faction.`;
  const ogUrl = `https://labelmuster.bisks.net/summary/${encodeURIComponent(handle)}/${encodeURIComponent(label)}/${count}`;

  html = html
    .split(GENERIC_OG_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(desc))
    .split(GENERIC_TWITTER_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(`"${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /summary/<handle>/<label>/<count> — the distinct, shareable, per-result
    // URL. Every result gets its own og:title/description/url so a link
    // unfurler can't collapse different musters into one card.
    const m = url.pathname.match(/^\/summary\/([^/]+)\/([^/]+)\/(\d+)\/?$/);
    if (m) return renderSummary(env, request, m[1], m[2], m[3]);

    return env.ASSETS.fetch(request);
  },
};

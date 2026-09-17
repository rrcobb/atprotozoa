// crossbreed Worker
//
// Three jobs:
//  1. Legacy path mount (bisks.net/crossbreed) — strip the prefix, same
//     conditional-strip pattern as every other path-mounting-era site (see
//     notes/40-new-site-playbook.md). Missing the bare-PREFIX case here used
//     to 404 both bisks.net/crossbreed and bisks.net/crossbreed/.
//  2. /s/<seed> — the client already reproduces a breed from location.pathname
//     on boot (public/index.html's boot block), but a direct hit needed the
//     Worker to serve the SPA shell instead of 404ing on a path with no
//     matching static file. Stamps real per-seed OG tags onto that shell
//     using the same breed() logic the browser uses (public/shared.js is
//     written to be imported from both).
//  3. /registry.json — buildthis's own catalog, shaped like mino.mobi's
//     deploy-registry.json, so @minomobi.com's bot can reach into ours the
//     same way this page reaches into theirs.
import { BUILDTHIS, breedTitleDesc, fetchLiveMinomobi } from "../public/shared.js";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/crossbreed";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function replaceTag(html: string, pattern: RegExp, value: string): string {
  return html.replace(pattern, `$1${value}$2`);
}

async function renderShare(env: Env, request: Request, seed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();
  try {
    // Best-effort: a live mino.mobi pairing if it answers within budget,
    // otherwise breedTitleDesc falls back to the same offline snapshot the
    // browser would use — a shared link should never fail to render because
    // mino.mobi is slow or down.
    const catalog = await fetchLiveMinomobi(fetch, 2000);
    const { title, desc } = breedTitleDesc(seed, catalog || undefined);
    const ogUrl = `https://crossbreed.bisks.net/s/${encodeURIComponent(seed)}`;
    html = replaceTag(html, /(<title>)[^<]*(<\/title>)/, esc(title));
    html = replaceTag(html, /(<meta name="description" content=")[^"]*(")/, esc(desc));
    html = replaceTag(html, /(<meta property="og:title" content=")[^"]*(")/, esc(title));
    html = replaceTag(html, /(<meta property="og:description" content=")[^"]*(")/, esc(desc));
    html = replaceTag(html, /(<meta property="og:url" content=")[^"]*(")/, ogUrl);
    html = replaceTag(html, /(<meta name="twitter:title" content=")[^"]*(")/, esc(title));
    html = replaceTag(html, /(<meta name="twitter:description" content=")[^"]*(")/, esc(desc));
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

function renderRegistry(): Response {
  const surfaces = BUILDTHIS.map((s: { name: string; blurb: string }) => ({
    surface: s.name,
    type: "frontend",
    note: s.blurb,
  }));
  return new Response(JSON.stringify({ surfaces }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }

    if (url.pathname === "/registry.json") return renderRegistry();

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, decodeURIComponent(m[1]));

    return env.ASSETS.fetch(new Request(url, request));
  },
};

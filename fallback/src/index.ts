// Fallback Worker for *.bisks.net: the shared host, and the 404 for the rest.
//
// The zone has a wildcard DNS record and an ACM wildcard cert, so ANY
// subdomain — including typos and hostnames nobody ever created — resolves and
// completes TLS. This Worker holds the `*.bisks.net/*` route, so it answers
// every hostname no site claimed with a more specific route of its own.
//
// Two kinds of hostname land here:
//
// 1. Hosted sites. Most sites never needed a Worker of their own: theirs only
//    handed the request to ASSETS. Since the account hit Cloudflare's
//    500-Worker cap (notes/20-deploy.md, "Hosted sites"), those sites have no
//    wrangler.toml and are served from here instead. fallback/sites.json lists
//    them; build.mjs copies each one's public/ into .build/<name>/, and this
//    Worker maps <name>.bisks.net/<path> to /<name>/<path> in that assets
//    directory. Each site keeps its own hostname, so its own origin, cookies
//    and localStorage — sharing a Worker doesn't share an origin.
//
// 2. Everything else: a "nothing here" page with a 404.
//
// Real sites with their own Worker never reach this: Cloudflare matches the
// most specific route first, so `trigrams.bisks.net/*` goes straight to
// atprotozoa-trigrams.

import manifest from "../sites.json";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface SiteOptions {
  // Path-era mount prefix the site's old Worker stripped ("/<name>" or
  // "/games/<name>"), so old <name>.bisks.net/<name>/... links keep working.
  prefix?: string;
  // not_found_handling = "single-page-application": unmatched paths serve
  // the site's index.html with a 200.
  spa?: boolean;
}

const SITES: Record<string, SiteOptions> = manifest.sites;
const ZONE = ".bisks.net";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>not found — bisks.net</title>
    <meta name="robots" content="noindex" />
    <style>
      :root {
        --bg: #ffffff; --ink: #111111; --muted: #6b6b6b;
        --faint: #e4e4e4; --accent: #1a5fd0;
        --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code",
          "Roboto Mono", Menlo, Consolas, monospace;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; background: var(--bg); color: var(--ink);
        font-family: var(--mono); font-size: 15px; line-height: 1.6;
      }
      .wrap { max-width: 640px; margin: 0 auto; padding: 3.5rem 1.25rem 6rem; }
      h1 { font-size: 1.6rem; margin: 0 0 0.35rem; font-weight: 600; }
      p { color: var(--muted); margin: 0 0 1.5rem; font-size: 0.9rem; }
      .host {
        font-weight: 600; color: var(--ink); word-break: break-all;
      }
      .rule { border-top: 1px solid var(--ink); margin: 2rem 0 1.25rem; }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>nothing here</h1>
      <div class="rule"></div>
      <p>There's no site at <span class="host">__HOST__</span>.</p>
      <p>It may have been renamed, retired, or never existed.
         The full list of what's running is on the front page.</p>
      <p><a href="https://bisks.net/">bisks.net &rarr;</a></p>
    </div>
  </body>
</html>
`;

// Escape the host before echoing it back. It comes from the request, so it is
// attacker-controlled in principle; without this a crafted Host header could
// inject markup into the page.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!;
  });
}

function notFound(url: URL): Response {
  const body = HTML.replace("__HOST__", escapeHtml(url.hostname));
  return new Response(body, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Short cache: a hostname that's 404 today may be a real site tomorrow
      // once someone deploys it, and we don't want that stuck in caches.
      "cache-control": "public, max-age=60",
      "x-robots-tag": "noindex",
    },
  });
}

// <name>.bisks.net → <name>, for a single label only. Object.hasOwn rather
// than `in`, so "constructor.bisks.net" can't match a prototype property.
function siteFor(hostname: string): string | null {
  if (!hostname.endsWith(ZONE)) return null;
  const name = hostname.slice(0, -ZONE.length);
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  return Object.hasOwn(SITES, name) ? name : null;
}

async function serve(request: Request, env: Env, url: URL, name: string, opts: SiteOptions): Promise<Response> {
  let path = url.pathname;

  // URL parsing already resolved "." and ".." segments, so the path can't climb
  // out of /<name>/ as written. Encoded separators and dots could still decode
  // into one further down, so refuse them outright. No site uses them.
  if (/%2e|%2f|%5c|\\/i.test(path)) return notFound(url);

  if (opts.prefix) {
    const p = opts.prefix;
    if (path === p) {
      const to = new URL(url);
      to.pathname = p + "/";
      return Response.redirect(to.toString(), 308);
    }
    if (path.startsWith(p + "/")) path = path.slice(p.length) || "/";
  }

  const base = `/${name}`;
  const assetUrl = new URL(url);
  assetUrl.pathname = base + path;
  if (!assetUrl.pathname.startsWith(base + "/")) return notFound(url);

  let res = await env.ASSETS.fetch(new Request(assetUrl, request));

  if (res.status === 404 && opts.spa && (request.method === "GET" || request.method === "HEAD")) {
    // base + "/", not "/index.html": the asset router answers index.html with
    // a redirect to the directory.
    const index = new URL(assetUrl);
    index.pathname = base + "/";
    res = await env.ASSETS.fetch(new Request(index, request));
  }

  // The asset router's own redirects (/about.html → /about, /dir → /dir/)
  // name the path inside .build/, which carries the /<name> folder. Take it
  // back off so the browser stays on the site's real paths.
  const out = new Response(res.body, res);
  const location = res.headers.get("location");
  if (location && res.status >= 300 && res.status < 400) {
    const to = new URL(location, assetUrl);
    if (to.origin === assetUrl.origin && (to.pathname === base || to.pathname.startsWith(base + "/"))) {
      to.pathname = to.pathname.slice(base.length) || "/";
      out.headers.set("location", to.pathname + to.search + to.hash);
    }
  }
  // Says which Worker answered. audit/cf-cutover.mjs waits for it after
  // removing a site's own route, to know the hostname has switched over.
  out.headers.set("x-bisks-host", "fallback");
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const name = siteFor(url.hostname);
    if (name) return serve(request, env, url, name, SITES[name]);
    // The list this deployed version hosts. audit/cf-cutover.mjs reads it
    // before removing a site's own route, so it never cuts a site over to a
    // fallback that doesn't have its files yet.
    if (url.hostname === "fallback" + ZONE && url.pathname === "/hosted.json") {
      return Response.json(Object.keys(SITES), { headers: { "cache-control": "no-store" } });
    }
    return notFound(url);
  },
};

// Fallback Worker for *.bisks.net: the router for hosted sites, and the 404
// for everything else.
//
// The zone has a wildcard DNS record and an ACM wildcard cert, so ANY
// subdomain — including typos and hostnames nobody ever created — resolves and
// completes TLS. This Worker holds the `*.bisks.net/*` route, so it answers
// every hostname no site claimed with a more specific route of its own.
//
// Two kinds of hostname land here:
//
// 1. Hosted sites: sites with no Worker of their own (notes/20-deploy.md,
//    "Hosted sites"). fallback/sites.json lists them, each with a group, and
//    hosts/<group>/ (atprotozoa-host-<group>) serves that group's files. This
//    Worker passes the request to that host over a service binding, unchanged.
//    Splitting the sites across hosts means a push redeploys one group, and a
//    bad host deploy reaches only its own group.
//
// 2. Everything else: a "nothing here" page with a 404.
//
// Real sites with their own Worker never reach this: Cloudflare matches the
// most specific route first, so `trigrams.bisks.net/*` goes straight to
// atprotozoa-trigrams.

import manifest from "../sites.json";

interface Fetcher {
  fetch: (req: Request) => Promise<Response>;
}

// HOST_1 … HOST_n, one service binding per hosts/<n>/ (wrangler.toml).
type Env = Record<string, Fetcher>;

const SITES: Record<string, { group: number }> = manifest.sites;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const name = siteFor(url.hostname);
    if (name) {
      const host = env[`HOST_${SITES[name].group}`];
      if (host) return host.fetch(request);
    }
    // The list this deployed version routes. audit/cf-cutover.mjs reads it
    // before removing a site's own route, so it never cuts a site over before
    // fallback knows about it.
    if (url.hostname === "fallback" + ZONE && url.pathname === "/hosted.json") {
      return Response.json(Object.keys(SITES), { headers: { "cache-control": "no-store" } });
    }
    return notFound(url);
  },
};

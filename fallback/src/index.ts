// Fallback Worker for unclaimed *.bisks.net hostnames.
//
// The zone has a wildcard DNS record and an ACM wildcard cert, so ANY
// subdomain — including typos and hostnames nobody ever created — resolves and
// completes TLS. Without something on the wildcard route those requests hit a
// raw Cloudflare error page (522/1016). This Worker is that something.
//
// It only ever runs for hostnames no real site claimed: Cloudflare matches the
// most specific route first, so `trigrams.bisks.net/*` goes straight to
// atprotozoa-trigrams and never touches this. That's deliberate — the fallback
// must not sit in the path of real sites, so it can't take them down.
//
// Deliberately static and boring: no remote scripts, no user input, no proxying.
// This zone was flagged by Safe Browsing once already (see notes/20-deploy.md),
// and a wildcard means anyone can conjure a hostname under it — so whatever
// answers on those hostnames should be obviously inert.

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

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Bare hostname with nothing else: send them to the gallery rather than
    // showing an error, since a guessed subdomain usually means they wanted
    // the site index.
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
  },
};

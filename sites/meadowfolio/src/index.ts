// meadowfolio Worker — meadowfolio.bisks.net.
//
// Mostly static: everything but one path falls through to the ASSETS
// binding. The gallery/dreamnet/buildthis-requests sections read live data
// anonymously in the browser (public/app.js + public/lib/feed.js); only
// curator picks are baked into public/data.js at build time.
//
// GET /api/releases is the one dynamic route: fromthewestmeadow.com's own
// landing page lists her "Featured Tools" with real titles/blurbs, but it
// has no CORS headers, so public/app.js can't fetch it directly from the
// browser. This proxies that fetch server-side (no CORS restriction between
// two Workers) and hands back parsed JSON.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const LANDING_PAGE = "https://fromthewestmeadow.com/";

interface Release {
  host: string;
  origin: string;
  title: string;
  blurb: string;
}

// The landing page's "Featured Tools" list is hand-maintained HTML, not a
// feed — a lightweight regex pull is plenty rather than pulling in an HTML
// parser for one list. Each entry: `<li><a href="http://<host>[:<port>]">Title</a>
// &mdash; blurb (maybe with nested tags)</li>`. Order on the page is oldest
// release first (matches every date we can independently verify against the
// account's post history), which the caller relies on.
//
// Captures scheme and port explicitly (not just the bare host) — some
// entries link to non-default ports (e.g. a local/self-hosted tool on
// `:8080`), and the original regex's host-only character class didn't allow
// a `:`, so any entry with a port failed to match at all and silently
// vanished from the list. Flagged by @fromthewestmeadow.com 2026-08-06.
const ENTRY_RE =
  /<li>\s*<a\s+href="(https?):\/\/([a-z0-9.-]+)(:[0-9]+)?"[^>]*>([^<]*)<\/a>\s*(?:&mdash;|—|-)\s*([\s\S]*?)<\/li>/gi;

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function parseFeaturedTools(html: string): Release[] {
  const out: Release[] = [];
  for (const m of html.matchAll(ENTRY_RE)) {
    const scheme = m[1].toLowerCase();
    const hostname = m[2].trim().toLowerCase();
    const port = m[3] || "";
    const title = stripTags(m[4]);
    const blurb = stripTags(m[5]);
    if (hostname && title) {
      out.push({ host: `${hostname}${port}`, origin: `${scheme}://${hostname}${port}`, title, blurb });
    }
  }
  return out;
}

async function handleReleasesApi(): Promise<Response> {
  const cors = {
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
  };
  try {
    const res = await fetch(LANDING_PAGE, { redirect: "follow" });
    if (!res.ok) {
      return new Response(JSON.stringify({ releases: [], error: `landing page returned ${res.status}` }), {
        status: 502,
        headers: cors,
      });
    }
    const html = await res.text();
    const releases = parseFeaturedTools(html);
    // The page itself changes rarely; a short edge cache keeps a burst of
    // visitors from each triggering their own fetch of someone else's site.
    return new Response(JSON.stringify({ releases }), {
      headers: { ...cors, "cache-control": "public, max-age=900" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ releases: [], error: `couldn't reach the landing page (${err})` }), {
      status: 502,
      headers: cors,
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/releases") return handleReleasesApi();
    return env.ASSETS.fetch(request);
  },
};

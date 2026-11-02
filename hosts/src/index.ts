// Host Worker: serves one group of hosted sites.
//
// Hosted sites have no Worker of their own (notes/20-deploy.md, "Hosted
// sites"). fallback/sites.json lists them, each with a group; hosts/<n>/ is the
// Worker atprotozoa-host-<n> for group n. ../build.mjs copies each of its
// sites' public/ into .build/<name>/, and this maps <name>.bisks.net/<path> to
// /<name>/<path> there. Each site keeps its own hostname, so its own origin,
// cookies and localStorage — sharing a Worker doesn't share an origin.
//
// These Workers have no routes. fallback holds *.bisks.net/* and hands each
// request to the right group over a service binding, with the URL unchanged.
// They also answer directly under `wrangler dev --host <name>.bisks.net`, which
// is how to run a hosted site locally.

import manifest from "../../fallback/sites.json";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GROUP: string;
}

interface SiteOptions {
  group: number;
  // Path-era mount prefix the site's old Worker stripped ("/<name>" or
  // "/games/<name>"), so old <name>.bisks.net/<name>/... links keep working.
  prefix?: string;
  // not_found_handling = "single-page-application": unmatched paths serve
  // the site's index.html with a 200.
  spa?: boolean;
}

const SITES: Record<string, SiteOptions> = manifest.sites;
const ZONE = ".bisks.net";

function notFound(): Response {
  return new Response("not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
}

// <name>.bisks.net → <name>, for a single label in this Worker's group only.
// Object.hasOwn rather than `in`, so "constructor.bisks.net" can't match a
// prototype property.
function siteFor(hostname: string, group: string): string | null {
  if (!hostname.endsWith(ZONE)) return null;
  const name = hostname.slice(0, -ZONE.length);
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  if (!Object.hasOwn(SITES, name)) return null;
  return String(SITES[name].group) === group ? name : null;
}

async function serve(request: Request, env: Env, url: URL, name: string, opts: SiteOptions): Promise<Response> {
  let path = url.pathname;

  // URL parsing already resolved "." and ".." segments, so the path can't climb
  // out of /<name>/ as written. Encoded separators and dots could still decode
  // into one further down, so refuse them outright. No site uses them.
  if (/%2e|%2f|%5c|\\/i.test(path)) return notFound();

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
  if (!assetUrl.pathname.startsWith(base + "/")) return notFound();

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
  // Which Worker answered. audit/cf-cutover.mjs waits for "fallback" after
  // removing a site's own route, to know the hostname has switched over.
  out.headers.set("x-bisks-host", "fallback");
  out.headers.set("x-bisks-group", env.GROUP);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const name = siteFor(url.hostname, env.GROUP);
    if (name) return serve(request, env, url, name, SITES[name]);
    return notFound();
  },
};

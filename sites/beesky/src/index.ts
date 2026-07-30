// beesky Worker — mounted at bisks.net/beesky/
//
// Everything that computes the hive (resolving a handle's moots) and renders
// it (the three.js scene) runs client-side in public/ — see public/hive.js.
// This Worker has two jobs:
//
// 1. Strip the /beesky mount prefix before handing requests to the static
//    ASSETS binding, same as every path-mounted site (see the barebones
//    template in notes/40-new-site-playbook.md) — the assets directory has
//    no idea it isn't living at the domain root.
//
// 2. /img?u=<cdn.bsky.app avatar url> — a narrow CORS proxy for avatar
//    images. cdn.bsky.app sends no Access-Control-Allow-Origin header, so a
//    three.js TextureLoader with crossOrigin="anonymous" fails outright
//    (the browser blocks the load), and loading without crossOrigin taints
//    the WebGL canvas — which then throws when the share button tries
//    canvas.toBlob() for a screenshot. Re-fetching the same bytes through
//    this Worker and adding an open CORS header fixes both. Locked down to
//    exactly cdn.bsky.app's avatar paths so this can't become an open
//    image proxy for arbitrary URLs.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/beesky";
const AVATAR_HOST = "cdn.bsky.app";
const AVATAR_PATH_RE = /^\/img\/avatar(_thumbnail)?\/plain\/did:[a-z0-9:%._-]+\/[a-z0-9]+(@[a-z]+)?$/i;

async function proxyAvatar(rawUrl: string | null): Promise<Response> {
  if (!rawUrl) return new Response("missing u", { status: 400 });
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || target.host !== AVATAR_HOST || !AVATAR_PATH_RE.test(target.pathname)) {
    return new Response("url not allowed", { status: 400 });
  }

  const upstream = await fetch(target.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown> });
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "image/jpeg");
  headers.set("access-control-allow-origin", "*");
  // Avatar blobs are content-addressed (the CID is in the path) — safe to
  // cache hard, unlike the html/json below.
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";

    if (url.pathname === "/img") {
      return proxyAvatar(url.searchParams.get("u"));
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};

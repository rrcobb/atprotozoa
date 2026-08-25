// Served at the root of mootgrinder.bisks.net. Moot lookups hit the public
// AppView straight from the browser, and the grinder/sand sim is pure
// canvas — see public/app.js. This Worker's one job:
//
// /img?u=<cdn.bsky.app avatar url> — a narrow CORS proxy for avatar images.
// cdn.bsky.app sends no Access-Control-Allow-Origin header, so
// crossOrigin="anonymous" makes the <img> load fail outright, and loading
// without it taints the sampling canvas — which then throws on
// getImageData(), and the whole point of this site is reading pixels back
// out of that canvas to turn them into sand grains. Re-fetching the same
// bytes through this Worker and adding an open CORS header fixes it. Locked
// down to exactly cdn.bsky.app's avatar paths — copied from
// sites/beesky/src/index.ts / sites/mootspy/src/index.ts.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

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
  // cache hard.
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/img") {
      return proxyAvatar(url.searchParams.get("u"));
    }
    return env.ASSETS.fetch(request);
  },
};

// murkbox Worker — murkbox.bisks.net
//
// Two jobs:
//   1. /img?u=<cdn.bsky.app url> — a narrow same-origin proxy for avatar and
//      feed-image blobs. cdn.bsky.app sends no CORS header, so loading an
//      image cross-origin taints the canvas the effects pipeline reads pixels
//      back out of (getImageData throws on a tainted canvas). Re-fetching
//      through this same-origin route sidesteps that entirely — copied from
//      sites/avcart's /img route, same allowlist shape.
//   2. Everything else falls through to the static ASSETS binding — the pedal
//      UI and the whole effects engine run client-side in public/index.html
//      against the public AppView (public.api.bsky.app, CORS *, no auth).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const IMG_HOST = "cdn.bsky.app";
const IMG_PATH_RE =
  /^\/img\/(avatar|avatar_thumbnail|feed_thumbnail|feed_fullsize)\/plain\/did:[a-z0-9:%._-]+\/[a-z0-9]+(@[a-z]+)?$/i;

async function proxyImage(rawUrl: string | null): Promise<Response> {
  if (!rawUrl) return new Response("missing u", { status: 400 });
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || target.host !== IMG_HOST || !IMG_PATH_RE.test(target.pathname)) {
    return new Response("url not allowed", { status: 400 });
  }
  const upstream = await fetch(target.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "image/jpeg");
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/img") {
      return proxyImage(url.searchParams.get("u"));
    }
    return env.ASSETS.fetch(request);
  },
};

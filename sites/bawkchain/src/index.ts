// Mounted at bisks.net/bawkchain/ — strips the mount prefix before handing
// the request to the static-asset router, since the assets directory has no
// idea it isn't living at the domain root.
//
// One dynamic route: GET /bawkchain/avatar?u=<cdn.bsky.app avatar url>. The
// client oil-paints winners' avatars on a <canvas>, which needs pixel
// readback (getImageData) — and cdn.bsky.app doesn't send
// Access-Control-Allow-Origin, so a plain crossOrigin="anonymous" <img> load
// fails outright (confirmed against the live CDN, not a guess). Proxying the
// fetch through this same-origin Worker sidesteps that: the browser never
// makes a cross-origin request for the pixel data in the first place.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/bawkchain";
const AVATAR_HOST = "cdn.bsky.app";
const AVATAR_PATH_PREFIX = "/img/avatar/";

async function proxyAvatar(request: Request, target: string): Promise<Response> {
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("bad avatar url", { status: 400 });
  }
  // Only ever proxy Bluesky's own avatar CDN — this is not a general-purpose
  // image proxy.
  if (targetUrl.hostname !== AVATAR_HOST || !targetUrl.pathname.startsWith(AVATAR_PATH_PREFIX)) {
    return new Response("avatar url not allowed", { status: 400 });
  }
  const upstream = await fetch(targetUrl.toString(), {
    cf: { cacheTtl: 3600, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=3600, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname === PREFIX + "/avatar") {
      const target = url.searchParams.get("u");
      if (!target) return new Response("missing ?u=", { status: 400 });
      return proxyAvatar(request, target);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};

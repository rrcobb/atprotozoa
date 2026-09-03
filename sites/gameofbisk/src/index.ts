// Served at the root of gameofbisk.bisks.net.
//
// One dynamic route: GET /avatar?u=<cdn.bsky.app avatar url>. The client
// rasterizes a selected bisk's author avatar onto a <canvas> as part of
// building the cellular-automaton seed grid, which needs pixel readback
// (getImageData) — and cdn.bsky.app doesn't send
// Access-Control-Allow-Origin, so a plain crossOrigin="anonymous" <img> load
// fails outright. Proxying through this same-origin Worker sidesteps that.
// Copied from sites/bawkchain's identical avatar proxy.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const AVATAR_HOST = "cdn.bsky.app";
const AVATAR_PATH_PREFIX = "/img/avatar/";

async function proxyAvatar(target: string): Promise<Response> {
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
    if (url.pathname === "/avatar") {
      const target = url.searchParams.get("u");
      if (!target) return new Response("missing ?u=", { status: 400 });
      return proxyAvatar(target);
    }
    return env.ASSETS.fetch(request);
  },
};

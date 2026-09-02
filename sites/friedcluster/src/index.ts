// friedcluster Worker — friedcluster.bisks.net
//
// Everything real happens client-side (public/lib/fry.js): recursive
// <canvas> pixel manipulation + JPEG re-encoding of each avatar. That
// requires drawImage()-ing the avatar with crossOrigin="anonymous" so the
// canvas isn't tainted (getImageData/toDataURL both throw on a tainted
// canvas). cdn.bsky.app sends no Access-Control-Allow-Origin header on any
// image variant (confirmed by hand: curl -I with and without an Origin
// header — no access-control-* headers at all), so a crossOrigin-anonymous
// <img> request to it always fails outright. /avatar?u=<cdn.bsky.app URL>
// re-serves the image same-origin so the browser stops treating it as
// cross-origin at all. Copied from sites/rotcast/src/index.ts's proxyAvatar
// (copy, don't abstract). Locked to the cdn.bsky.app host only — it is not
// a general URL proxy.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const ALLOWED_IMAGE_HOSTS = new Set(["cdn.bsky.app"]);

async function proxyAvatar(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("u");
  if (!target) return new Response("missing u", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch (_) {
    return new Response("bad url", { status: 400 });
  }
  if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    return new Response("host not allowed", { status: 400 });
  }

  const upstream = await fetch(parsed.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  if (!upstream.ok || !upstream.body) return new Response("upstream error", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/avatar") return proxyAvatar(request);
    return env.ASSETS.fetch(request);
  },
};

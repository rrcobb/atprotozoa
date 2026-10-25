// Served at the root of hotdog-tierlist.bisks.net. The crawl and searches are
// browser fetches against the public AppView; the one server job is /img/*,
// a same-origin pass-through for cdn.bsky.app post images. That CDN sends no
// CORS headers, so the browser can't read pixels from it directly (the colour
// prefilter and CLIP both need to). Images are immutable by CID, so they're
// cached at the edge and for a week in the browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const IMG_PATH = /^\/img\/(feed_thumbnail|feed_fullsize)\/plain\/(did:[a-z]+:[A-Za-z0-9._:%-]+)\/([a-z0-9]+)(@[a-z]+)?$/;

export default {
  async fetch(request: Request, env: Env, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/img/")) {
      const m = IMG_PATH.exec(url.pathname);
      if (!m || request.method !== "GET") return new Response("bad image path", { status: 400 });
      const cache = (globalThis as any).caches?.default as Cache | undefined;
      const key = new Request(url.origin + url.pathname);
      const hit = await cache?.match(key);
      if (hit) return hit;
      const upstream = await fetch(`https://cdn.bsky.app/img${url.pathname.slice(4)}`);
      if (!upstream.ok) return new Response("upstream " + upstream.status, { status: upstream.status === 404 ? 404 : 502 });
      const res = new Response(upstream.body, {
        headers: {
          "content-type": upstream.headers.get("content-type") || "image/jpeg",
          "cache-control": "public, max-age=604800, immutable",
          "access-control-allow-origin": "*",
        },
      });
      if (cache) ctx?.waitUntil(cache.put(key, res.clone()));
      return res;
    }
    return env.ASSETS.fetch(request);
  },
};

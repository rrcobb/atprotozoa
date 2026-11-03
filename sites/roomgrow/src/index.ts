// roomgrow Worker: roomgrow.bisks.net
// /grid relays Room World's room list (no CORS headers upstream). Everything else is static.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UPSTREAM = "https://world2.anthonybecker.me/api/grid";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/grid") return env.ASSETS.fetch(req);
    // Cached at the edge for 3 s: many visitors polling to confirm their saves share one upstream read.
    const up = await fetch(UPSTREAM, { cf: { cacheTtl: 3, cacheEverything: true } } as RequestInit);
    return new Response(up.body, {
      status: up.status,
      headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
    });
  },
};

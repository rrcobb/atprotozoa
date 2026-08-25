// Served at the root of kolpelor.bisks.net — everything runs client-side
// against Bluesky's public AppView and the signed-in player's own PDS, so the
// Worker just forwards to the static-asset router. The one exception is
// /atlas, a pretty-URL alias for the static atlas.html shell (the network-wide
// roster directory, built client-side by lib/global-index.js) — same pattern
// as sites/catspace's /directory route.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/atlas" || url.pathname === "/atlas/") {
      const shellRes = await env.ASSETS.fetch(new Request(new URL("/atlas.html", request.url), { method: "GET" }));
      const shell = await shellRes.text();
      return new Response(shell, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};

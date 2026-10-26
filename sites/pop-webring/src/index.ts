// Served at the root of pop-webring.bisks.net. Static hub plus stateless
// redirects: /next/<site>, /prev/<site>, /random (optionally /random?from=<site>).
// Order is the ring order; keep in sync with public/ring.js and ring.json.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const RING: string[] = ["chipotlike", "corral-royale", "subwaidvania", "applebeesthetic", "drive-thru-sim", "waffleborne", "popeyelite", "shackgaze", "cheesecake-factorio"];

const url = (n: string) => `https://${n}.bisks.net/`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const u = new URL(request.url);
    const m = u.pathname.match(/^\/(next|prev)\/([a-z0-9-]+)\/?$/);
    if (m) {
      const i = RING.indexOf(m[2]);
      if (i < 0) return Response.redirect(u.origin + "/", 302);
      const j = (i + (m[1] === "next" ? 1 : RING.length - 1)) % RING.length;
      return Response.redirect(url(RING[j]), 302);
    }
    if (u.pathname === "/random") {
      const from = u.searchParams.get("from");
      const pool = RING.filter((n) => n !== from);
      return Response.redirect(url(pool[Math.floor(Math.random() * pool.length)]), 302);
    }
    return env.ASSETS.fetch(request);
  },
};

// mootree Worker — mounted on its own host, mootree.bisks.net. Pure static
// site (client-side OAuth + AppView reads only), so the only server job is
// handing every request straight to the asset router. No mount-prefix
// stripping needed: this site owns the whole host, unlike the older
// path-mounted sites (see notes/40-new-site-playbook.md, "Subdomains
// again").

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

// vaporize Worker — vaporize.bisks.net
//
// The whole effect (loading moots, the laser sweep, the disintegration
// animation) runs client-side in public/index.html + public/lib/. Nothing
// here needs server state or a per-result route, so this is the plain
// ASSETS-passthrough template from notes/40-new-site-playbook.md.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

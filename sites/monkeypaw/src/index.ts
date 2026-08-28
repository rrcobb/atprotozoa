// monkeypaw Worker — monkeypaw.bisks.net
//
// Everything runs client-side (public/index.html + public/lib/paw.js). No
// dynamic server surface needed: no OAuth, no per-result share route — just
// serve the static site.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

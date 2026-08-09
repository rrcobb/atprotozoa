// puresong Worker — served at the root of puresong.bisks.net (see
// notes/40-new-site-playbook.md). Pure static site; no mount-prefix
// stripping needed since this is a brand-new subdomain-only site.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

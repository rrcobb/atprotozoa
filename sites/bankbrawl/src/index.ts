// bankbrawl Worker — served at the root of bankbrawl.bisks.net
// (see notes/40-new-site-playbook.md). Pure static site; the two fictional
// balances never leave the browser, so there is nothing for a server to do.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

// meowdoku Worker — served at the root of meowdoku.bisks.net (see
// notes/40-new-site-playbook.md). Pure static site; every request just falls
// through to the static-asset router.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

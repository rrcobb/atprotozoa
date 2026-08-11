// purrscue Worker — served at the root of purrscue.bisks.net (see
// notes/40-new-site-playbook.md). Pure static site; the whole game runs
// client-side (see public/index.html) — there is nothing for a server to do.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

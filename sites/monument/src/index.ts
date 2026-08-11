// Served at the root of monument.bisks.net — pure static site, nothing for a
// server to do (see notes/40-new-site-playbook.md).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

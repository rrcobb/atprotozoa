// Served at the root of partytime.bisks.net — pure static site, nothing for a
// server to do (see notes/40-new-site-playbook.md). The clock is computed
// client-side from a fixed +8h offset (China Standard Time has no DST).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

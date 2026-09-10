// Served at the root of pickyourpoison.bisks.net — a static save-select
// screen, no server-side logic needed. Requests just fall through to ASSETS.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

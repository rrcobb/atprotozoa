// Served at the root of ratcop.bisks.net. The whole translator runs
// client-side against a hardcoded glossary, so the Worker's only job is to
// hand requests to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

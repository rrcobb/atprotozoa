// Served at the root of byok.bisks.net. Static only — the whole point of this
// site is that the provider call happens in the browser with the visitor's own
// key, so there is deliberately no server-side API route and no secret binding.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

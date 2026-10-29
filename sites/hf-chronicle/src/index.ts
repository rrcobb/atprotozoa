// hf-chronicle Worker
//
// Served at the root of hf-chronicle.bisks.net. No server-side logic — the timeline
// itself is static HTML (public/index.html).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

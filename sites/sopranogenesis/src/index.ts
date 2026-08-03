// Served at the root of sopranogenesis.bisks.net. The whole thing is a static
// CSS/JS title-sequence page — the Worker just forwards to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

// Served at the root of retrosynth.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything (molecule editor, synthesis
// generator, share card) runs client-side — no per-result server route.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

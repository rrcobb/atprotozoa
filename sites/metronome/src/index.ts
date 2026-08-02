// Served at the root of metronome.bisks.net. Pure static site — the whole
// metronome runs client-side with the Web Audio API. No mount-prefix
// stripping needed; just forward to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

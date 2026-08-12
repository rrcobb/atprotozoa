// Served at the root of thisminute.bisks.net — everything runs client-side
// (Jetstream websocket + a Markov chain over the last minute of it), so the
// Worker just forwards to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

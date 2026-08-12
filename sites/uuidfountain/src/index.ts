// Served at the root of uuidfountain.bisks.net. Pure static site — the
// fountain, the counter, and the three.js scene all run client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

// Served at the root of fruitflyheaven.bisks.net. Pure static site — no server-side
// logic, the whole connectome sim runs client-side in the browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

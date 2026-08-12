// Served at the root of beehive.bisks.net. Pure static site — no server-side
// logic, the quiz and hive growth all run client-side against localStorage.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

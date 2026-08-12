// Served at the root of mathhive.bisks.net. Pure static site — no server-side
// logic, the math solving and bee animation all run client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

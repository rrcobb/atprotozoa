// undergrow Worker — undergrow.bisks.net. Static shell only; the game is
// client-side and saves to localStorage.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

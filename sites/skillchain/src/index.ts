// skillchain Worker: forwards everything to static assets. All game state
// lives in players' own PDSes and the browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

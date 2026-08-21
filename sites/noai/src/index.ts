// Served at the root of noai.bisks.net, so requests pass straight to the
// static-asset router. No server-side behavior — the whole thing runs in
// the browser against Jetstream and the public AppView.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

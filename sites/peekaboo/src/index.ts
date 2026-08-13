// Served at the root of peekaboo.bisks.net, so requests are passed to the
// static-asset router unchanged. Fully static/client-side — the OAuth dance
// and the reveal-by-liking mechanic all run in the browser (see public/).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

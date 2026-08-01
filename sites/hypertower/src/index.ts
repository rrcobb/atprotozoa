// hypertower Worker — hypertower.bisks.net
//
// Fully static/client-side (see public/ — the whole game runs in the
// browser, no server state, no secrets). The Worker just serves ./public
// via ASSETS; it owns its own hostname so there's no mount-prefix to strip.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

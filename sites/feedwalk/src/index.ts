// feedwalk Worker — feedwalk.bisks.net
//
// Fully static/client-side (see public/ — the whole gallery runs in the
// browser: public AppView reads only, nothing written, no login). The
// Worker just serves ./public via ASSETS; it owns its own hostname so
// there's no mount-prefix to strip.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

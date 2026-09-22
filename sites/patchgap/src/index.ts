// patchgap Worker — patchgap.bisks.net.
//
// Pure static site: every number on the page comes from a live, client-side
// fetch to the NVD CVE API 2.0 (see public/app.js). No dynamic routes, no
// per-request compute. Every request falls through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

// vulndensity Worker — vulndensity.bisks.net
// Everything runs in the browser (public/app.js plots a bundled dataset); the
// Worker just forwards to the static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

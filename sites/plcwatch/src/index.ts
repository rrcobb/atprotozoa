// Served at the root of plcwatch.bisks.net. The whole ticker is static
// (public/index.html + public/app.js) — no server-side behavior needed.
// All the actual polling happens client-side, straight from the visitor's
// browser to plc.directory's own (CORS-open) export endpoint.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

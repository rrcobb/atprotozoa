// Served at the root of macpaint.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything (the bitmap canvas, the tools,
// the drawing-script interpreter) runs client-side in public/ — no server
// surface needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

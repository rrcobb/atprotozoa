// Served at the root of pixelcreep.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything (canvas compositing, uploads)
// runs client-side in public/ — no server-side surface needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

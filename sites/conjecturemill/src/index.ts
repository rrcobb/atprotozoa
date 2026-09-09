// conjecturemill Worker — served at the root of conjecturemill.bisks.net.
// Everything real happens client-side (public/index.html runs the actual
// number-theory checks in the browser); the Worker just forwards to ASSETS.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

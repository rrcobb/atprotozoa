// decoherence Worker
// Mounted at bisks.net/decoherence/ — strips the mount prefix before handing
// the request to the static-asset router (a pure client-side piece, no
// server surface beyond that).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/decoherence";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};

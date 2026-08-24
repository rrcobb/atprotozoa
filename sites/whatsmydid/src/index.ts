// whatsmydid Worker
//
// Served at the root of whatsmydid.bisks.net. No server-side logic — handle
// resolution and DID-doc lookup both happen client-side against public,
// unauthenticated endpoints (see public/index.html). The Worker just forwards
// to the static asset shell.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

// Served at the root of mootflow.bisks.net. Everything real happens in the
// browser (public/app.js) against the public AppView + the account's own
// PDS — this Worker only serves static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

// grudges Worker
//
// Served at the root of grudges.bisks.net. No server-side logic — the whole
// page is static; the list itself lives in public/data/items.json.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

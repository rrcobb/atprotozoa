// zettelkasten Worker — served at the root of zettelkasten.bisks.net.
// Pure static site: notes, links, tags, and the graph all live in the
// browser's localStorage. The Worker just forwards to the static-asset router.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

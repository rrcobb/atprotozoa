// fluoddityview Worker — fluoddityview.bisks.net
//
// A Bluesky app view where every post's text and context (handle, name,
// timestamp, counts) is rendered as fluoddity particle swarms instead of
// static text — the moving-font engine from important-art, pointed at a real
// feed instead of a fixed plaque. Everything lives client-side in public/;
// posts are fetched straight from the public AppView in the browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

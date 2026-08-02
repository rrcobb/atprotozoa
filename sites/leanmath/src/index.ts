// leanmath Worker — leanmath.bisks.net
//
// dulanyw.bsky.social asked @buildthis for a page that converts Lean code
// into understandable mathematical notation: paste in, hit convert, get
// LaTeX (rendered + copyable). The actual translator is entirely client-side
// (public/app.js) — this Worker just serves the static shell.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

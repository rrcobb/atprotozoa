// tokenbricks Worker — tokenbricks.bisks.net
//
// Everything happens client-side (public/index.html): type or paste text,
// pick an OpenAI tokenizer (o200k_base / cl100k_base / p50k_base / r50k_base),
// and it's BPE-encoded right there in the browser via the gpt-tokenizer
// package (loaded from esm.sh as a plain ES module — pure JS, no wasm, no
// model weights to fetch). No server inference, no text ever leaves the tab.
//
// Served at the root of its own hostname, so requests just pass through to
// the static-asset router unchanged. No dynamic route needed: there's no
// per-user server-side result worth a bespoke share URL, so this Worker does
// nothing but serve static files.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

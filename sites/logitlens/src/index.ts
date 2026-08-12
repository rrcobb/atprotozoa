// logitlens Worker — logitlens.bisks.net
//
// Everything happens client-side (public/index.html): pick one of a handful
// of small causal LMs, type a prompt, and the page runs a single real
// forward pass through the model in-browser via transformers.js (WASM/ONNX),
// then softmaxes the final logits into the actual next-token probability
// distribution. No server inference, no API calls out — the model is
// fetched straight from the Hugging Face CDN into the browser.
//
// Served at the root of its own hostname, so requests just pass through to
// the static-asset router unchanged. No dynamic route needed: there's no
// per-user server-side result to render (a prompt + a probability table
// isn't worth a bespoke share URL the way a per-handle score is elsewhere in
// this repo), so unlike sites/cursekind this Worker does nothing but serve
// static files.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};

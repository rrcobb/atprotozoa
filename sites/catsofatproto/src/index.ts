// catsofatproto Worker — RETIRED
//
// This experiment streamed live, unvetted photos off the Bluesky firehose and
// got the whole bisks.net domain flagged by Google Safe Browsing ("deceptive
// pages", 2026-07-26). It has been reduced to a static retirement stub.
//
// The old Worker also ran an /img/ CORS proxy for the in-browser classifier;
// that route is gone. All this now does is strip the mount prefix and serve the
// single static page under public/.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Mounted at bisks.net/catsofatproto/ (and still reachable at the leftover
// catsofatproto.bisks.net hostname until that binding is removed on Cloudflare).
const PREFIX = "/catsofatproto";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};

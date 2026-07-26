// catsofatproto Worker
//
// One job beyond serving static assets: proxy Bluesky CDN images through
// /img/<thumb|full>/<did>/<cid> so the page can add `access-control-allow-origin`
// to them. cdn.bsky.app doesn't send CORS headers, so a plain <img src="cdn url">
// displays fine but a <canvas>/tf.js pixel read on it is blocked as tainted. The
// grid itself never uses this route (it points straight at cdn.bsky.app); only
// images queued for in-browser cat classification get proxied.
//
// The route only ever forwards to a URL we build ourselves under a fixed host
// (cdn.bsky.app) from a validated did + cid — it's not a general open proxy.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Mounted at bisks.net/catsofatproto/ — catsofatproto.bisks.net never had its
// own custom domain (the zone's custom-domain cap, see notes/20-deploy.md), so
// this Worker claims a path route on the already-live bisks.net zone instead.
const PREFIX = "/catsofatproto";

const CDN = "https://cdn.bsky.app";

const VARIANTS: Record<string, string> = {
  thumb: "feed_thumbnail",
  full: "feed_fullsize",
};

// did:plc:<24 base32 chars> or did:web:<domain>
const DID_RE = /^did:(plc:[a-z2-7]{20,64}|web:[a-zA-Z0-9.-]+)$/;
// CIDv1 string form, base32 (RFC4648, no padding)
const CID_RE = /^[a-z2-7]{20,80}$/;

function cors(extra?: Record<string, string>): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    ...extra,
  };
}

async function handleImg(url: URL): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean); // ["img", variant, did, cid]
  const [, variant, did, cid] = parts;
  const upstreamVariant = variant && VARIANTS[variant];
  if (!upstreamVariant || !did || !cid || !DID_RE.test(did) || !CID_RE.test(cid)) {
    return new Response("bad request", { status: 400, headers: cors() });
  }

  const target = `${CDN}/img/${upstreamVariant}/plain/${did}/${cid}@jpeg`;
  const upstream = await fetch(target, {
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("upstream error", { status: upstream.status || 502, headers: cors() });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: cors({
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400, immutable",
    }),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";

    if (url.pathname.startsWith("/img/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: cors() });
      }
      try {
        return await handleImg(url);
      } catch (e) {
        return new Response("proxy error: " + String((e as Error)?.message || e), {
          status: 502,
          headers: cors(),
        });
      }
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};

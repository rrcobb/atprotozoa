// trigrams Worker
//
// Two jobs:
//  1. Redirect / -> /firehose/, else serve static assets.
//  2. /api/search — an AUTHENTICATED searchPosts proxy. Anonymous searchPosts on
//     api.bsky.app is administratively blocked at volume (403 "forbidden by
//     administrative rules" — see notes/71). /rich needs real search coverage, so
//     we proxy through a Bluesky session minted from an app-password (the same
//     buildthis bot credential), exactly how mino does it. Keeps /rich open-read:
//     visitors don't log in; the Worker holds the one credential.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOT_IDENTIFIER: string; // the bot DID/handle for createSession
  BOT_APP_PASSWORD: string; // app-password (wrangler secret)
}

const PDS = "https://bsky.social";
const APPVIEW = "https://api.bsky.app";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

// Module-level token cache. Workers reuse the isolate across requests, so a minted
// session survives between calls until it nears expiry. Access tokens last ~2h;
// refresh a bit early.
let cached: { jwt: string; exp: number } | null = null;

async function botToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp > now + 60_000) return cached.jwt;
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: env.BOT_IDENTIFIER,
      password: env.BOT_APP_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(`createSession failed: ${res.status}`);
  }
  const j = (await res.json()) as { accessJwt: string };
  // Don't trust a fixed TTL blindly; ~100 min is safely under the ~2h access life.
  cached = { jwt: j.accessJwt, exp: now + 100 * 60_000 };
  return j.accessJwt;
}

async function handleSearch(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get("q");
  if (!q) {
    return json({ error: "missing q" }, 400);
  }
  const limit = url.searchParams.get("limit") || "15";

  const jwt = await botToken(env);
  const target =
    `${APPVIEW}/xrpc/app.bsky.feed.searchPosts` +
    `?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`;

  let res = await fetch(target, { headers: { authorization: `Bearer ${jwt}` } });
  // If the cached token was stale/revoked, mint a fresh one once and retry.
  if (res.status === 401) {
    cached = null;
    const fresh = await botToken(env);
    res = await fetch(target, { headers: { authorization: `Bearer ${fresh}` } });
  }
  // Pass through the AppView's status + body (incl. 429 so the client can back off).
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300", // search results are stable enough
      ...CORS,
    },
  });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/search") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: CORS });
      }
      try {
        return await handleSearch(url, env);
      } catch (e) {
        return json({ error: String((e as Error)?.message || e) }, 502);
      }
    }

    if (url.pathname === "/") {
      return Response.redirect(new URL("/firehose/", url).toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};

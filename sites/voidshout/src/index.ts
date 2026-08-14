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

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOT_IDENTIFIER: string; // the bot DID/handle for createSession
  BOT_APP_PASSWORD: string; // app-password (wrangler secret)
  STRIKES: KVNamespace; // pending trebuchet strikes, keyed by target DID
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

// Params passed straight through to searchPosts when present. "q" and "limit"
// are handled separately below (q is required, limit gets a default).
const PASSTHROUGH_PARAMS = [
  "sort",
  "since",
  "until",
  "mentions",
  "author",
  "lang",
  "tag",
  "domain",
  "url",
  "cursor",
];

async function handleSearch(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get("q");
  if (!q) {
    return json({ error: "missing q" }, 400);
  }
  const limit = url.searchParams.get("limit") || "15";

  const jwt = await botToken(env);
  const target = new URL(`${APPVIEW}/xrpc/app.bsky.feed.searchPosts`);
  target.searchParams.set("q", q);
  target.searchParams.set("limit", limit);
  for (const key of PASSTHROUGH_PARAMS) {
    const v = url.searchParams.get(key);
    if (v) target.searchParams.set(key, v);
  }

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

// ---- /api/strike — /launcher's "aim at a poster" mode -----------------------
// A strike is a fire-and-forget marker: "@byHandle launched a trigram at you."
// Written when the trebuchet fires with a handle-only target (no specific post
// to reply to). /launcher polls for it on login and plays the crash-in
// animation, then acks it so it doesn't replay. Keyed by target DID in KV, not
// verified against the poster's PDS — it's a cosmetic notification, not a
// record of anything that needs to be trustworthy beyond "don't let it grow
// unbounded" (capped list, ack clears it).

const MAX_STRIKES_PER_TARGET = 15;

function strikeKey(did: string): string {
  return `strike:${did}`;
}

async function handleStrikeGet(url: URL, env: Env): Promise<Response> {
  const did = url.searchParams.get("did");
  if (!did) return json({ error: "missing did" }, 400);
  const raw = await env.STRIKES.get(strikeKey(did));
  const strikes = raw ? JSON.parse(raw) : [];
  return json({ strikes });
}

async function handleStrikePost(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { targetDid, targetHandle, g, byDid, byHandle, postUri } = body || {};
  if (!targetDid || !g || !byDid || !postUri) {
    return json({ error: "missing fields" }, 400);
  }
  if (targetDid === byDid) return json({ error: "can't strike yourself" }, 400);

  const key = strikeKey(String(targetDid));
  const raw = await env.STRIKES.get(key);
  const list = raw ? JSON.parse(raw) : [];
  list.push({
    id: crypto.randomUUID(),
    g: String(g).slice(0, 200),
    byDid: String(byDid),
    byHandle: String(byHandle || "").slice(0, 200),
    targetHandle: String(targetHandle || "").slice(0, 200),
    postUri: String(postUri).slice(0, 500),
    at: Date.now(),
  });
  while (list.length > MAX_STRIKES_PER_TARGET) list.shift();
  await env.STRIKES.put(key, JSON.stringify(list));
  return json({ ok: true });
}

async function handleStrikeAck(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { did, ids } = body || {};
  if (!did) return json({ error: "missing did" }, 400);

  const key = strikeKey(String(did));
  if (!Array.isArray(ids) || ids.length === 0) {
    await env.STRIKES.delete(key);
    return json({ ok: true });
  }
  const raw = await env.STRIKES.get(key);
  const list = raw ? JSON.parse(raw) : [];
  const ackSet = new Set(ids);
  const remaining = list.filter((s: any) => !ackSet.has(s.id));
  if (remaining.length) await env.STRIKES.put(key, JSON.stringify(remaining));
  else await env.STRIKES.delete(key);
  return json({ ok: true });
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

    if (url.pathname === "/api/strike") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      try {
        if (request.method === "GET") return await handleStrikeGet(url, env);
        if (request.method === "POST") return await handleStrikePost(request, env);
      } catch (e) {
        return json({ error: String((e as Error)?.message || e) }, 502);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/api/strike/ack") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      try {
        if (request.method === "POST") return await handleStrikeAck(request, env);
      } catch (e) {
        return json({ error: String((e as Error)?.message || e) }, 502);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/") {
      return Response.redirect(new URL("/firehose/", url).toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};

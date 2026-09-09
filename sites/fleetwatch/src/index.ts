// Served at the root of fleetwatch.bisks.net. The board itself is static
// (public/index.html + public/app.js). The one piece of server-side
// behavior is /api/check: a Worker isn't a browser, so its fetch() isn't
// bound by CORS — it can read the real status code back from another
// bisks.net subdomain, which the visitor's own browser never could. That
// closes the "honest limit" this site launched with on 2026-09-07 (a 200
// and a 404 looked identical from no-cors mode). No state is kept here —
// every call is a stateless proxy fetch, checked and thrown away.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const MAX_BATCH = 20;
const TIMEOUT_MS = 8000;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function isAllowedUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.hostname !== "bisks.net" && !u.hostname.endsWith(".bisks.net")) return null;
  return u;
}

async function checkOne(raw: string) {
  const u = isAllowedUrl(raw);
  if (!u) return { url: raw, status: null, ok: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
    return { url: raw, status: res.status, ok: res.ok };
  } catch {
    return { url: raw, status: null, ok: false, timeout: controller.signal.aborted };
  } finally {
    clearTimeout(timer);
  }
}

async function handleCheck(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: JSON_HEADERS });
  }
  const urls = Array.isArray((body as { urls?: unknown[] })?.urls)
    ? ((body as { urls: unknown[] }).urls.filter((u) => typeof u === "string") as string[]).slice(0, MAX_BATCH)
    : [];
  const results = await Promise.all(urls.map(checkOne));
  return new Response(JSON.stringify({ results }), { headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/check") {
      return handleCheck(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// honkfeed Worker
//
// Serves the static SPA, plus one job the browser can't do itself:
// /api/fetch?url=<feed-url> fetches an RSS/Atom feed server-side and hands
// the raw XML back same-origin, because browsers can't fetch most feed URLs
// directly (no CORS headers on the vast majority of RSS endpoints).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

// Best-effort SSRF guard: block obviously-internal hosts. Cloudflare Workers'
// fetch() already runs on Cloudflare's edge network rather than any origin's
// private network, so this isn't load-bearing security -- just a courtesy
// check against feeding the proxy a loopback/link-local URL.
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "::1") {
    return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleFetch(url: URL): Promise<Response> {
  const target = url.searchParams.get("url");
  if (!target) return json({ error: "missing url" }, 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: "that's not a valid url" }, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return json({ error: "only http/https feed urls are allowed" }, 400);
  }
  if (isPrivateHost(parsed.hostname)) {
    return json({ error: "that url isn't fetchable" }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "honkfeed/1.0 (+https://honkfeed.bisks.net; rss reader)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      return json({ error: `feed server returned ${res.status}` }, 502);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return json({ error: "feed is too large to honk at" }, 502);
    }
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": res.headers.get("content-type") || "application/xml; charset=utf-8",
        "cache-control": "public, max-age=120",
      },
    });
  } catch (e) {
    const timedOut = (e as Error)?.name === "AbortError";
    return json({ error: timedOut ? "feed took too long to respond" : "couldn't fetch that feed" }, 502);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/fetch") {
      return handleFetch(url);
    }
    return env.ASSETS.fetch(request);
  },
};

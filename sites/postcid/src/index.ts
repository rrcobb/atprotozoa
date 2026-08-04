// postcid Worker — served at the root of postcid.bisks.net.
//
// The composer itself (text, langs, facets, embeds, dag-cbor + CID math) is
// entirely client-side — see public/lib/compose.js. This Worker exists only
// to proxy two things a browser can't do cross-origin:
//
//   /api/unfurl?url=<page>   fetch an arbitrary page server-side, scrape its
//                            og:title / og:description / og:image for the
//                            "external link" embed preview.
//   /api/img?url=<image>     re-fetch an arbitrary image server-side with an
//                            open CORS header, so the browser can read its
//                            raw bytes and hash them into a blob CID exactly
//                            as a PDS would (see notes below and compose.js).
//
// Everything else falls through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const MAX_HTML_BYTES = 500_000;
const MAX_IMAGE_BYTES = 8_000_000;
const FETCH_TIMEOUT_MS = 8000;

// Best-effort SSRF guard: reject obviously-internal hosts before we ever
// fetch. This can't see through DNS rebinding, but it stops the easy stuff
// (localhost, loopback, link-local, RFC1918) without pulling in a resolver.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "::1") {
    return true;
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h.startsWith("[") || h.includes(":")) {
    // any literal IPv6 that isn't obviously global — be conservative.
    if (h.startsWith("::") || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) {
      return true;
    }
  }
  return false;
}

function parseTargetUrl(raw: string | null): URL | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (isBlockedHost(u.hostname)) return null;
  return u;
}

async function readCapped(res: Response, cap: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, out.byteLength - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= out.byteLength) break;
  }
  return out;
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

async function handleUnfurl(url: URL): Promise<Response> {
  const target = parseTargetUrl(url.searchParams.get("url"));
  if (!target) return json({ error: "bad or blocked url" }, 400);

  let res: Response;
  try {
    res = await fetch(target.toString(), {
      headers: { accept: "text/html,*/*", "user-agent": "postcid.bisks.net/1.0 (link preview)" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    return json({ error: `fetch failed: ${String((e as Error)?.message || e)}` }, 502);
  }
  if (!res.ok) return json({ error: `upstream ${res.status}` }, 502);

  const bytes = await readCapped(res, MAX_HTML_BYTES);
  const html = new TextDecoder("utf-8").decode(bytes);

  const title =
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i,
    ]) || metaContent(html, [/<title[^>]*>([^<]*)<\/title>/i]);

  const description = metaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
  ]);

  let image = metaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:image["']/i,
  ]);
  if (image) {
    try {
      image = new URL(image, target).toString();
    } catch {
      image = null;
    }
  }

  return json({
    uri: target.toString(),
    title: title || target.hostname,
    description: description || "",
    image,
  });
}

async function handleImg(url: URL): Promise<Response> {
  const target = parseTargetUrl(url.searchParams.get("url"));
  if (!target) return json({ error: "bad or blocked url" }, 400);

  let res: Response;
  try {
    res = await fetch(target.toString(), {
      headers: { accept: "image/*", "user-agent": "postcid.bisks.net/1.0 (link preview)" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    return json({ error: `fetch failed: ${String((e as Error)?.message || e)}` }, 502);
  }
  if (!res.ok) return json({ error: `upstream ${res.status}` }, 502);

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return json({ error: "not an image" }, 415);

  const bytes = await readCapped(res, MAX_IMAGE_BYTES);
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
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

    if (url.pathname === "/api/unfurl" || url.pathname === "/api/img") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      try {
        return url.pathname === "/api/unfurl" ? await handleUnfurl(url) : await handleImg(url);
      } catch (e) {
        return json({ error: String((e as Error)?.message || e) }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};

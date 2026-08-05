// synastry Worker
//
// One job beyond serving static assets: /api/geocode proxies OpenStreetMap's
// Nominatim search so a birth place (city name) can be turned into lat/lon in
// the browser without a CORS error and without any API key — Nominatim just
// asks for an identifying User-Agent, which the client can't set itself.
// Houses/Ascendant need latitude; the planets' zodiac positions don't, so
// geocoding is optional enrichment, not a hard requirement to use the site.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "synastry.bisks.net (atprotozoa toy site; no contact, low volume)";

// Tiny module-level cache — the Worker isolate is reused across requests, and
// birth-place lookups repeat a lot (major cities) with answers that never change.
const cache = new Map<string, { body: string; exp: number }>();
const CACHE_MS = 30 * 60_000;

async function handleGeocode(url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "missing q" }, 400);
  if (q.length > 200) return json({ error: "query too long" }, 400);

  const cached = cache.get(q);
  if (cached && cached.exp > Date.now()) {
    return new Response(cached.body, { headers: { "content-type": "application/json; charset=utf-8" } });
  }

  const target = new URL(NOMINATIM);
  target.searchParams.set("format", "json");
  target.searchParams.set("limit", "5");
  target.searchParams.set("q", q);

  const res = await fetch(target, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) return json({ error: `geocoder ${res.status}` }, 502);
  const raw = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  const results = raw.map((r) => ({ name: r.display_name, lat: parseFloat(r.lat), lon: parseFloat(r.lon) }));
  const body = JSON.stringify({ results });

  cache.set(q, { body, exp: Date.now() + CACHE_MS });
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8" } });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/geocode") {
      try {
        return await handleGeocode(url);
      } catch (e) {
        return json({ error: String((e as Error)?.message || e) }, 502);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

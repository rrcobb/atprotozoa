// lightrail Worker — lightrail.bisks.net
//
// /api/dir/0|1  -> { "<platform stop_id>": [{ seconds_left, minutes_left, time, vehicle }, ...] }
//                  for every platform of one direction (0 northbound, 1 southbound).
//                  33 upstream subrequests, which stays under the 50-subrequest
//                  Worker limit, so each direction is its own call.
// /api/stop/<id> -> the raw upstream array for one platform.
// Everything else falls through to the static assets.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const ROUTE_ID = "11693"; // the single LIGHT RAILLINK route in the GTFS
const UPSTREAM = "https://www.mta.maryland.gov/schedule/real-time-stops/";
const FRESH_SECONDS = 15; // the MTA feed itself refreshes about every 30s

type Arrival = { timestamp: number; time: string; minutes_left: number; seconds_left: number; vehicle: string };

async function platformIds(env: Env, origin: string): Promise<Record<string, { d: number }>> {
  const r = await env.ASSETS.fetch(new Request(origin + "/data/line.json"));
  return ((await r.json()) as { platforms: Record<string, { d: number }> }).platforms;
}

async function arrivals(stopId: string): Promise<Arrival[]> {
  const r = await fetch(`${UPSTREAM}${stopId},${ROUTE_ID}`, {
    headers: { "user-agent": "lightrail.bisks.net (hobby tracker)", accept: "application/json" },
  });
  if (!r.ok) throw new Error("upstream " + r.status);
  const j = JSON.parse(await r.text());
  if (!Array.isArray(j)) throw new Error("unexpected upstream shape");
  return j;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${FRESH_SECONDS}`,
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    const cache = caches.default;
    const hit = await cache.match(req.url);
    if (hit) return hit;

    let res: Response;
    try {
      const platforms = await platformIds(env, url.origin);
      const m = url.pathname.match(/^\/api\/(dir|stop)\/(\w+)$/);
      if (!m) return json({ error: "not found" }, 404);
      if (m[1] === "stop") {
        if (!platforms[m[2]]) return json({ error: "unknown stop" }, 404);
        res = json(await arrivals(m[2]));
      } else {
        const d = Number(m[2]);
        if (d !== 0 && d !== 1) return json({ error: "dir must be 0 or 1" }, 404);
        const ids = Object.keys(platforms).filter((id) => platforms[id].d === d);
        const out: Record<string, Arrival[]> = {};
        let failed = 0;
        await Promise.all(
          ids.map(async (id) => {
            try { out[id] = await arrivals(id); } catch { failed++; }
          }),
        );
        // If most platforms failed the upstream is down; don't cache or serve a hollow success.
        if (failed > ids.length / 2) return json({ error: "MTA realtime unavailable" }, 502);
        res = json(out);
      }
    } catch (e) {
      return json({ error: "MTA realtime unavailable" }, 502);
    }
    ctx.waitUntil(cache.put(req.url, res.clone()));
    return res;
  },
};

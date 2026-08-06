// littleguys Worker
//
// Request from cee.wtf: drop a little guy anywhere in a real city and watch
// him wander the actual street network, turning randomly at every real
// intersection — bonus points for dropping up to 500 of them at once.
//
// The one thing that needs a server: OpenStreetMap data. The client can't
// hit Overpass directly (no CORS, and it's rude to hammer a public API from
// hundreds of browsers), so GET /api/graph does the real work: geocode (or
// take lat/lon straight from the client's geolocation), pull every walkable
// way in a radius from Overpass, and collapse it into a plain node/edge
// graph the client can do a random walk over with nothing but Math.random.
// The actual wandering — spawning up to 500 walkers, animating them,
// picking a random direction at each junction — all happens client-side in
// public/index.html; it's pure graph traversal, nothing here needs a round
// trip per step the way warmtrail's per-step weather fetches did.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA = "atprotozoa-littleguys/1.0 (https://littleguys.bisks.net)";

const MIN_RADIUS_M = 200;
const MAX_RADIUS_M = 1200;
const DEFAULT_RADIUS_M = 600;

// Highway types a pedestrian could plausibly be standing on. Excludes
// motorways/trunks (no foot access) and non-path infrastructure that
// sometimes carries a highway=* tag anyway.
const EXCLUDED_HIGHWAY =
  "motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway|bus_guideway|escape|platform|rest_area|services|planned|corridor|elevator";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function geocode(address: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=` + encodeURIComponent(address);
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    cf: { cacheTtl: 3600, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!rows.length) return null;
  return { lat: parseFloat(rows[0].lat), lon: parseFloat(rows[0].lon), label: rows[0].display_name };
}

const toRad = (d: number) => (d * Math.PI) / 180;
const EARTH_R_M = 6371000;

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(s));
}

interface OverpassGeomNode {
  lat: number;
  lon: number;
}
interface OverpassWay {
  type: "way";
  id: number;
  nodes: number[];
  geometry?: (OverpassGeomNode | null)[];
  tags?: Record<string, string>;
}

async function fetchOverpass(lat: number, lon: number, radiusM: number): Promise<OverpassWay[]> {
  const query =
    `[out:json][timeout:25];` +
    `(way["highway"]["highway"!~"^(${EXCLUDED_HIGHWAY})$"]["access"!~"^(private|no)$"](around:${radiusM},${lat},${lon}););` +
    `out geom;`;

  let lastErr: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal,
        cf: { cacheTtl: 21600, cacheEverything: true } as unknown as Record<string, unknown>,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        lastErr = new Error(`overpass ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassWay[] };
      return (json.elements || []).filter((e) => e.type === "way" && e.geometry);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("overpass unreachable");
}

interface GraphNode {
  lat: number;
  lon: number;
}
interface GraphEdge {
  to: number;
  distanceM: number;
  street: string | null;
}

// Collapses the raw OSM ways into a plain node-index graph. Every OSM node a
// way passes through becomes a graph node (not just junctions) — a walker
// only ever has a real *choice* where two or more ways actually meet, so a
// node that's just a shape point along one street naturally has exactly one
// way forward once you exclude where it came from, and the walk sails
// through without "deciding" anything there. That's what makes "random turn
// at every possible intersection" fall out of plain graph traversal instead
// of needing a separate junction-detection pass.
function buildGraph(ways: OverpassWay[]): { nodes: GraphNode[]; adjacency: GraphEdge[][] } {
  const idToIndex = new Map<number, number>();
  const nodes: GraphNode[] = [];
  const adjacency: GraphEdge[][] = [];

  function indexFor(osmId: number, lat: number, lon: number): number {
    let idx = idToIndex.get(osmId);
    if (idx === undefined) {
      idx = nodes.length;
      idToIndex.set(osmId, idx);
      nodes.push({ lat, lon });
      adjacency.push([]);
    }
    return idx;
  }

  for (const way of ways) {
    const geom = way.geometry || [];
    const street = way.tags?.name || null;
    let prevIdx: number | null = null;
    let prevLat = 0;
    let prevLon = 0;
    for (let i = 0; i < way.nodes.length; i++) {
      const g = geom[i];
      if (!g) {
        prevIdx = null; // gap in the geometry (rare) — break the chain here
        continue;
      }
      const idx = indexFor(way.nodes[i], g.lat, g.lon);
      if (prevIdx !== null && prevIdx !== idx) {
        const distanceM = haversineM(prevLat, prevLon, g.lat, g.lon);
        if (distanceM > 0) {
          adjacency[prevIdx].push({ to: idx, distanceM, street });
          adjacency[idx].push({ to: prevIdx, distanceM, street });
        }
      }
      prevIdx = idx;
      prevLat = g.lat;
      prevLon = g.lon;
    }
  }

  return { nodes, adjacency };
}

function nearestNode(nodes: GraphNode[], lat: number, lon: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = haversineM(lat, lon, nodes[i].lat, nodes[i].lon);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

async function handleGraph(url: URL): Promise<Response> {
  const address = url.searchParams.get("address")?.trim();
  const latParam = url.searchParams.get("lat");
  const lonParam = url.searchParams.get("lon");
  const radiusM = Math.max(
    MIN_RADIUS_M,
    Math.min(
      MAX_RADIUS_M,
      Math.round(parseFloat(url.searchParams.get("radius") || String(DEFAULT_RADIUS_M)) || DEFAULT_RADIUS_M),
    ),
  );

  let lat: number, lon: number, label: string;
  try {
    if (latParam && lonParam) {
      lat = parseFloat(latParam);
      lon = parseFloat(lonParam);
      label = "your location";
    } else if (address) {
      const g = await geocode(address);
      if (!g) return Response.json({ error: "couldn't find that place" }, { status: 404 });
      lat = g.lat;
      lon = g.lon;
      label = g.label;
    } else {
      return Response.json({ error: "give me an address, or lat/lon" }, { status: 400 });
    }
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return Response.json({ error: "that location didn't parse" }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: "couldn't look up that location, try again" }, { status: 502 });
  }

  try {
    const ways = await fetchOverpass(lat, lon, radiusM);
    const { nodes, adjacency } = buildGraph(ways);
    if (nodes.length < 2) {
      return Response.json(
        { error: "no streets found near there — try a spot in an actual town or city" },
        { status: 404 },
      );
    }
    const startNode = nearestNode(nodes, lat, lon);

    return Response.json({
      origin: { lat, lon, label },
      radiusM,
      startNode,
      nodeCount: nodes.length,
      nodes: nodes.map((n) => [n.lat, n.lon]),
      adjacency,
    });
  } catch (err) {
    return Response.json(
      { error: "the street map service is being slow right now, try again in a moment" },
      { status: 502 },
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/graph") {
      return handleGraph(url);
    }
    return env.ASSETS.fetch(request);
  },
};

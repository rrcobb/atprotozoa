// freecondoms Worker
//
// Serves the static shell, plus one API route: GET /api/find, which takes
// either an address or a lat/lon pair and answers with nearby places that
// carry OpenStreetMap tags for condom vending machines or family-planning /
// sexual-health clinics. Two free, keyless public services do the work:
//   - Nominatim (OSM's geocoder) turns an address into coordinates.
//   - Overpass (OSM's query API) finds tagged nodes/ways near a point.
// Both are community infrastructure with strict-but-generous usage policies
// (identify yourself with a User-Agent, don't hammer them) — fine for a
// person occasionally typing one address, not fine to call in a loop.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA = "atprotozoa-freecondoms/1.0 (https://freecondoms.bisks.net)";
const RADIUS_M = 12000; // ~7.5mi — OSM coverage of this tag is sparse, cast wide

interface Place {
  name: string;
  kind: "vending" | "clinic";
  lat: number;
  lon: number;
  distanceM: number;
}

async function geocode(
  address: string,
): Promise<{ lat: number; lon: number; label: string } | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=` +
    encodeURIComponent(address);
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    cf: { cacheTtl: 3600, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!rows.length) return null;
  return { lat: parseFloat(rows[0].lat), lon: parseFloat(rows[0].lon), label: rows[0].display_name };
}

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function findNearby(lat: number, lon: number): Promise<Place[]> {
  const query = `
    [out:json][timeout:25];
    (
      node["vending"="condoms"](around:${RADIUS_M},${lat},${lon});
      way["vending"="condoms"](around:${RADIUS_M},${lat},${lon});
      node["healthcare"="family_planning"](around:${RADIUS_M},${lat},${lon});
      way["healthcare"="family_planning"](around:${RADIUS_M},${lat},${lon});
      node["healthcare:speciality"~"family_planning"](around:${RADIUS_M},${lat},${lon});
    );
    out center 40;
  `;
  const body = "data=" + encodeURIComponent(query);
  const headers = { "content-type": "application/x-www-form-urlencoded", "User-Agent": UA };

  // The public instance rate-limits/times out under load; a mirror keeps a
  // single burst of traffic from just failing outright.
  let json: {
    elements: Array<{
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  } | null = null;
  for (const endpoint of [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ]) {
    try {
      const res = await fetch(endpoint, { method: "POST", headers, body });
      if (!res.ok) continue;
      json = await res.json();
      break;
    } catch {
      // try the next mirror
    }
  }
  if (!json) return [];

  const places: Place[] = [];
  for (const el of json.elements ?? []) {
    const plat = el.lat ?? el.center?.lat;
    const plon = el.lon ?? el.center?.lon;
    if (plat === undefined || plon === undefined) continue;
    const tags = el.tags ?? {};
    // "disused:amenity"/"razed:*" etc mean the tag is historical, not current.
    if (Object.keys(tags).some((k) => k.startsWith("disused:") || k.startsWith("razed:"))) continue;
    const kind: Place["kind"] = tags.vending === "condoms" ? "vending" : "clinic";
    const name =
      tags.name ??
      (kind === "vending" ? "condom vending machine" : "family planning / sexual health clinic");
    places.push({ name, kind, lat: plat, lon: plon, distanceM: haversineM(lat, lon, plat, plon) });
  }
  places.sort((a, b) => a.distanceM - b.distanceM);
  return places.slice(0, 25);
}

async function handleFind(url: URL): Promise<Response> {
  const address = url.searchParams.get("address")?.trim();
  const latParam = url.searchParams.get("lat");
  const lonParam = url.searchParams.get("lon");

  let lat: number, lon: number, label: string;
  try {
    if (latParam && lonParam) {
      lat = parseFloat(latParam);
      lon = parseFloat(lonParam);
      label = "your location";
    } else if (address) {
      const g = await geocode(address);
      if (!g) {
        return Response.json({ error: "couldn't find that address" }, { status: 404 });
      }
      lat = g.lat;
      lon = g.lon;
      label = g.label;
    } else {
      return Response.json({ error: "give me an address, or lat/lon" }, { status: 400 });
    }
    const places = await findNearby(lat, lon);
    return Response.json({ lat, lon, label, places });
  } catch (err) {
    return Response.json({ error: "lookup failed, try again in a moment" }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/find") {
      return handleFind(url);
    }
    return env.ASSETS.fetch(request);
  },
};

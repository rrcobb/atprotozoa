// warmward Worker
//
// Idea from @cee.wtf ("a compass that points in the warmest direction"),
// relayed by dave.9000ish.uk: take the visitor's location, look at the
// nearest cities, and point a compass needle at whichever one is warmest
// right now.
//
// One API route, GET /api/warmward, that takes either an address or a
// lat/lon pair and answers with the nearest cities (from a bundled GeoNames
// extract — cities15000.txt, pop >= 50,000, trimmed to name/country/lat/lon)
// plus their current temperature (Open-Meteo, free & keyless, batched in one
// request) and the compass bearing from the visitor to the warmest one.
//   - Nominatim (OSM's geocoder) turns a typed address into coordinates.
//   - Open-Meteo answers current temperature for a batch of lat/lon pairs.
// Both are free public services; identify with a User-Agent, don't hammer them.

import cities from "../data/cities.json";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA = "atprotozoa-warmward/1.0 (https://warmward.bisks.net)";
const NEAREST_N = 8;

type CityRow = [name: string, country: string, lat: number, lon: number, population: number];
const CITIES = cities as CityRow[];

interface CityResult {
  name: string;
  country: string;
  lat: number;
  lon: number;
  distanceKm: number;
  tempC: number | null;
  weatherCode: number | null;
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

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Initial great-circle bearing from a to b, in degrees, 0 = north, clockwise.
function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(bLon - aLon)) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLon - aLon));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function nearestCities(lat: number, lon: number, n: number): CityRow[] {
  return CITIES.map((c) => ({ c, d: haversineKm(lat, lon, c[2], c[3]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((r) => r.c);
}

async function fetchTemps(
  rows: CityRow[],
): Promise<Array<{ tempC: number | null; weatherCode: number | null }>> {
  const lats = rows.map((r) => r[2]).join(",");
  const lons = rows.map((r) => r[3]).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return rows.map(() => ({ tempC: null, weatherCode: null }));
  const json = (await res.json()) as
    | Array<{ current?: { temperature_2m?: number; weather_code?: number } }>
    | { current?: { temperature_2m?: number; weather_code?: number } };
  const arr = Array.isArray(json) ? json : [json];
  return rows.map((_, i) => ({
    tempC: arr[i]?.current?.temperature_2m ?? null,
    weatherCode: arr[i]?.current?.weather_code ?? null,
  }));
}

async function handleWarmward(url: URL): Promise<Response> {
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
        return Response.json({ error: "couldn't find that place" }, { status: 404 });
      }
      lat = g.lat;
      lon = g.lon;
      label = g.label;
    } else {
      return Response.json({ error: "give me an address, or lat/lon" }, { status: 400 });
    }
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return Response.json({ error: "that location didn't parse" }, { status: 400 });
    }

    const rows = nearestCities(lat, lon, NEAREST_N);
    const temps = await fetchTemps(rows);

    const results: CityResult[] = rows.map((r, i) => ({
      name: r[0],
      country: r[1],
      lat: r[2],
      lon: r[3],
      distanceKm: haversineKm(lat, lon, r[2], r[3]),
      tempC: temps[i].tempC,
      weatherCode: temps[i].weatherCode,
    }));

    const withTemp = results.filter((r) => r.tempC !== null);
    if (!withTemp.length) {
      return Response.json(
        { error: "couldn't get any temperatures, try again in a moment" },
        { status: 502 },
      );
    }
    const warmest = withTemp.reduce((a, b) => (b.tempC! > a.tempC! ? b : a));
    const bearing = bearingDeg(lat, lon, warmest.lat, warmest.lon);

    return Response.json({
      origin: { lat, lon, label },
      cities: results,
      warmest,
      bearingDeg: bearing,
    });
  } catch (err) {
    return Response.json({ error: "lookup failed, try again in a moment" }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/warmward") {
      return handleWarmward(url);
    }
    return env.ASSETS.fetch(request);
  },
};

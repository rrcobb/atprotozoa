// warmtrail Worker
//
// Follow-up from @cee.wtf to warmward (the compass that points at the
// warmest nearby city): instead of just pointing, simulate the walk you'd
// take if you kept obeying the needle. You place a heat sensor at a
// location, tune its range ("distance" — how far apart it samples in each
// direction) and its gain (how twitchy/noisy the reading is), and it takes
// a series of steps: sample the temperature in a ring of compass directions
// around itself, turn to face the warmest-smelling direction, walk forward,
// repeat. The whole path is drawn out.
//
// One API route, GET /api/walk, taking either an address or a lat/lon pair
// plus distanceKm/gain/steps, and returning the simulated path. Temperatures
// come from Open-Meteo (free, keyless, batched — one HTTP request per step
// covering all 8 sample points). Address text is geocoded via Nominatim,
// same as warmward.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA = "atprotozoa-warmtrail/1.0 (https://warmtrail.bisks.net)";

const MIN_STEPS = 4;
const MAX_STEPS = 12;
const MIN_DISTANCE_KM = 0.2;
const MAX_DISTANCE_KM = 20;
const MIN_GAIN = 1;
const MAX_GAIN = 10;

// 8 compass directions the sensor samples around itself each step.
const RING_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];

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

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const EARTH_R_KM = 6371;

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(s));
}

// Destination point given a start, an initial bearing (deg, 0 = N, clockwise), and a distance in km.
function destination(lat: number, lon: number, bearingDeg: number, distanceKm: number): { lat: number; lon: number } {
  const brng = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const delta = distanceKm / EARTH_R_KM;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lon: (((toDeg(lon2) + 540) % 360) - 180) };
}

// A small seeded pseudo-random generator so a given run's sensor jitter is
// reproducible from its inputs without needing crypto.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function fetchTemps(points: Array<{ lat: number; lon: number }>): Promise<(number | null)[]> {
  const lats = points.map((p) => p.lat.toFixed(4)).join(",");
  const lons = points.map((p) => p.lon.toFixed(4)).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=temperature_2m&timezone=auto`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return points.map(() => null);
  const json = (await res.json()) as
    | Array<{ current?: { temperature_2m?: number } }>
    | { current?: { temperature_2m?: number } };
  const arr = Array.isArray(json) ? json : [json];
  return points.map((_, i) => arr[i]?.current?.temperature_2m ?? null);
}

interface StepResult {
  lat: number;
  lon: number;
  tempC: number | null;
  bearingDeg: number;
  gradientStrength: number; // how confident the sensor was, 0..1
  distanceFromOriginKm: number;
  cumulativeDistanceKm: number;
  samples: Array<{ bearingDeg: number; tempC: number | null }>;
}

async function simulateWalk(
  originLat: number,
  originLon: number,
  distanceKm: number,
  gain: number,
  steps: number,
  seed: number,
): Promise<StepResult[]> {
  const rand = mulberry32(seed);
  const path: StepResult[] = [];
  let lat = originLat;
  let lon = originLon;
  let cumulative = 0;
  // Higher gain = a twitchier sensor: it amplifies whatever small
  // differences it finds, including ones that are really just noise in
  // the underlying weather model rather than a true regional gradient.
  const noiseDeg = (gain - 1) * 3.2;

  const originTemp = (await fetchTemps([{ lat, lon }]))[0];
  path.push({
    lat,
    lon,
    tempC: originTemp,
    bearingDeg: 0,
    gradientStrength: 0,
    distanceFromOriginKm: 0,
    cumulativeDistanceKm: 0,
    samples: [],
  });

  for (let i = 0; i < steps; i++) {
    const ring = RING_BEARINGS.map((b) => ({ b, ...destination(lat, lon, b, distanceKm) }));
    const temps = await fetchTemps(ring);
    const valid = ring
      .map((r, idx) => ({ b: r.b, t: temps[idx] }))
      .filter((r): r is { b: number; t: number } => r.t !== null);

    if (!valid.length) break; // no usable data this step — stop where we stand

    const mean = valid.reduce((s, r) => s + r.t, 0) / valid.length;
    let vx = 0;
    let vy = 0;
    for (const r of valid) {
      const w = r.t - mean;
      vx += w * Math.sin(toRad(r.b));
      vy += w * Math.cos(toRad(r.b));
    }
    const mag = Math.hypot(vx, vy);
    let bearing: number;
    if (mag < 1e-6) {
      // No detectable gradient at all — the sensor spins and picks an
      // arbitrary heading.
      bearing = rand() * 360;
    } else {
      bearing = (toDeg(Math.atan2(vx, vy)) + 360) % 360;
    }
    // Gain-scaled jitter: a sensitive sensor chases noise as much as signal.
    bearing = (bearing + (rand() * 2 - 1) * noiseDeg + 360) % 360;
    const strength = Math.max(0, Math.min(1, mag / (valid.length * 2)));

    const next = destination(lat, lon, bearing, distanceKm);
    lat = next.lat;
    lon = next.lon;
    cumulative += distanceKm;

    const hereTemp = valid.find((r) => Math.abs(((r.b - bearing + 540) % 360) - 180) < 22.5)?.t ?? mean;

    path.push({
      lat,
      lon,
      tempC: hereTemp,
      bearingDeg: bearing,
      gradientStrength: strength,
      distanceFromOriginKm: haversineKm(originLat, originLon, lat, lon),
      cumulativeDistanceKm: cumulative,
      samples: valid.map((r) => ({ bearingDeg: r.b, tempC: r.t })),
    });
  }

  return path;
}

async function handleWalk(url: URL): Promise<Response> {
  const address = url.searchParams.get("address")?.trim();
  const latParam = url.searchParams.get("lat");
  const lonParam = url.searchParams.get("lon");

  const distanceKm = Math.max(
    MIN_DISTANCE_KM,
    Math.min(MAX_DISTANCE_KM, parseFloat(url.searchParams.get("distance") || "2") || 2),
  );
  const gain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, parseFloat(url.searchParams.get("gain") || "3") || 3));
  const steps = Math.max(
    MIN_STEPS,
    Math.min(MAX_STEPS, Math.round(parseFloat(url.searchParams.get("steps") || "8") || 8)),
  );

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

    const seed = Math.floor((lat * 1e4 + lon * 1e4 + distanceKm * 1e3 + gain * 97 + steps) * 1000) >>> 0;
    const path = await simulateWalk(lat, lon, distanceKm, gain, steps, seed);
    if (path.length < 2) {
      return Response.json(
        { error: "couldn't get enough temperature data to take a single step, try again in a moment" },
        { status: 502 },
      );
    }

    const last = path[path.length - 1];
    return Response.json({
      origin: { lat, lon, label },
      params: { distanceKm, gain, steps },
      path,
      totalDistanceKm: last.cumulativeDistanceKm,
      netDistanceKm: last.distanceFromOriginKm,
      finalBearingDeg: last.bearingDeg,
    });
  } catch (err) {
    return Response.json({ error: "the walk failed partway through, try again in a moment" }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/walk") {
      return handleWalk(url);
    }
    return env.ASSETS.fetch(request);
  },
};

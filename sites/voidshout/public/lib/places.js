// places.js — the curated Place list. Static, shipped with the client, no
// GPS request anywhere in this app (a hard requirement of the brief): a
// member picks a Place from this list (search by name or emoji), never from
// navigator.geolocation. Real approximate lat/lng per place so the world map
// positions markers honestly.
//
// Anyone can publish a net.bisks.void.* record with a Place outside this
// list (see notes/00 in net.bisks.void.shout.json) — this is just what the
// reference client offers in its own search/picker.

export const PLACES = [
  { id: "tokyo", name: "Tokyo", emoji: "🗼", lat: 35.6762, lng: 139.6503 },
  { id: "nyc", name: "New York", emoji: "🗽", lat: 40.7128, lng: -74.006 },
  { id: "london", name: "London", emoji: "🎡", lat: 51.5074, lng: -0.1278 },
  { id: "paris", name: "Paris", emoji: "🥐", lat: 48.8566, lng: 2.3522 },
  { id: "berlin", name: "Berlin", emoji: "🐻", lat: 52.52, lng: 13.405 },
  { id: "istanbul", name: "Istanbul", emoji: "🕌", lat: 41.0082, lng: 28.9784 },
  { id: "cairo", name: "Cairo", emoji: "🏜️", lat: 30.0444, lng: 31.2357 },
  { id: "nairobi", name: "Nairobi", emoji: "🦁", lat: -1.2921, lng: 36.8219 },
  { id: "lagos", name: "Lagos", emoji: "🥁", lat: 6.5244, lng: 3.3792 },
  { id: "capetown", name: "Cape Town", emoji: "⛰️", lat: -33.9249, lng: 18.4241 },
  { id: "delhi", name: "Delhi", emoji: "🛕", lat: 28.7041, lng: 77.1025 },
  { id: "mumbai", name: "Mumbai", emoji: "🎬", lat: 19.076, lng: 72.8777 },
  { id: "bangkok", name: "Bangkok", emoji: "🍜", lat: 13.7563, lng: 100.5018 },
  { id: "hanoi", name: "Hanoi", emoji: "🍲", lat: 21.0278, lng: 105.8342 },
  { id: "seoul", name: "Seoul", emoji: "🏮", lat: 37.5665, lng: 126.978 },
  { id: "beijing", name: "Beijing", emoji: "🏯", lat: 39.9042, lng: 116.4074 },
  { id: "shanghai", name: "Shanghai", emoji: "🌆", lat: 31.2304, lng: 121.4737 },
  { id: "kathmandu", name: "Kathmandu", emoji: "🏔️", lat: 27.7172, lng: 85.324 },
  { id: "jakarta", name: "Jakarta", emoji: "🛺", lat: -6.2088, lng: 106.8456 },
  { id: "manila", name: "Manila", emoji: "🎣", lat: 14.5995, lng: 120.9842 },
  { id: "sydney", name: "Sydney", emoji: "🐨", lat: -33.8688, lng: 151.2093 },
  { id: "auckland", name: "Auckland", emoji: "🥝", lat: -36.8485, lng: 174.7633 },
  { id: "honolulu", name: "Honolulu", emoji: "🌺", lat: 21.3069, lng: -157.8583 },
  { id: "reykjavik", name: "Reykjavík", emoji: "🌋", lat: 64.1466, lng: -21.9426 },
  { id: "moscow", name: "Moscow", emoji: "🪆", lat: 55.7558, lng: 37.6173 },
  { id: "rome", name: "Rome", emoji: "🍝", lat: 41.9028, lng: 12.4964 },
  { id: "lisbon", name: "Lisbon", emoji: "🐟", lat: 38.7223, lng: -9.1393 },
  { id: "dublin", name: "Dublin", emoji: "🍀", lat: 53.3498, lng: -6.2603 },
  { id: "toronto", name: "Toronto", emoji: "🍁", lat: 43.6532, lng: -79.3832 },
  { id: "mexicocity", name: "Mexico City", emoji: "🌵", lat: 19.4326, lng: -99.1332 },
  { id: "havana", name: "Havana", emoji: "🚗", lat: 23.1136, lng: -82.3666 },
  { id: "bogota", name: "Bogotá", emoji: "☕", lat: 4.711, lng: -74.0721 },
  { id: "lima", name: "Lima", emoji: "🦙", lat: -12.0464, lng: -77.0428 },
  { id: "riodejaneiro", name: "Rio de Janeiro", emoji: "🎪", lat: -22.9068, lng: -43.1729 },
  { id: "buenosaires", name: "Buenos Aires", emoji: "💃", lat: -34.6037, lng: -58.3816 },
  { id: "ushuaia", name: "Ushuaia", emoji: "🐧", lat: -54.8019, lng: -68.303 },
  { id: "mcmurdo", name: "McMurdo Station", emoji: "🧊", lat: -77.8419, lng: 166.6863 },
];

export function placeById(id) {
  return PLACES.find((p) => p.id === id) || null;
}

/** Any place id/name/emoji/lat/lng seen in real activity that isn't in the
 * curated list — a stranger-published `net.bisks.void.shout.place` outside
 * PLACES. The lexicon allows this (see notes/00 above), and every such
 * record still carries its own real lat/lng, so rather than collapsing it
 * to a single "elsewhere" point, surface it as its own discovered Place —
 * search and the world map should agree on what's actually out there.
 * `activity` is a Map<placeId, {place, count}> as produced by
 * feed.js's placeActivityFromTrees(). */
export function discoveredPlaces(activity) {
  const known = new Set(PLACES.map((p) => p.id));
  return [...activity.values()]
    .map((e) => e.place)
    .filter((p) => p && !known.has(p.id))
    .sort((a, b) => (activity.get(b.id)?.count || 0) - (activity.get(a.id)?.count || 0));
}

export function searchPlaces(query, extra = []) {
  const list = extra.length ? PLACES.concat(extra) : PLACES;
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (p) => p.name.toLowerCase().includes(q) || p.emoji.includes(q) || p.id.includes(q),
  );
}

// Equirectangular projection: lat/lng -> percentage position on the flat
// map div. worldmap-data.js's land silhouette is projected with this exact
// same formula, so every pin and route lands on real coastline, not a
// blank grid.
//
// Real records carry lat/lng as strings (atproto's record data model has no
// float type — see lexicons/net.bisks.void.shout.json#place), while PLACES
// above keeps them as JS numbers for local map math. Accept either so
// callers don't need to know which they've got.
export function project(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  return {
    xPct: ((lngNum + 180) / 360) * 100,
    yPct: ((90 - latNum) / 180) * 100,
  };
}

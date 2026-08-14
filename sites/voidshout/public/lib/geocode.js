// geocode.js — turns a map-picked lat/lng into a human-readable Place name
// and a flag emoji, so a tap on the map produces a real name ("Porto,
// Portugal") instead of raw coordinates. Client-side call straight to a
// public reverse-geocoding API, same house pattern as bskypost.js's direct
// call to the public Bluesky AppView — no server proxy, no key, nothing
// secret to hold. BigDataCloud's "reverse-geocode-client" endpoint is
// purpose-built for exactly this (free, keyless, CORS-open for browser
// callers). If it's unreachable or slow, degrade to a coordinate string
// rather than block Place selection on a third party being up.

const ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const TIMEOUT_MS = 5000;

function flagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return null;
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)));
}

function coordName(lat, lng) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? "E" : "W"}`;
}

/** @returns {Promise<{name: string, emoji: string}>} Always resolves —
 *  never throws — since a failed lookup shouldn't block picking a Place. */
export async function reverseGeocode(lat, lng) {
  const fallback = { name: coordName(lat, lng), emoji: "📍" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return fallback;
    const j = await res.json();
    const locality = j.city || j.locality || j.principalSubdivision || "";
    const country = j.countryName || "";
    let name = [locality, country].filter(Boolean).join(", ");
    if (!name) name = fallback.name;
    if (name.length > 120) name = name.slice(0, 117) + "…"; // stay under the lexicon's 128-char cap with room to spare
    const emoji = flagEmoji(j.countryCode) || "📍";
    return { name, emoji };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

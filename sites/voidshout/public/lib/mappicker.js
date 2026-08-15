// mappicker.js — a reusable "pick a real spot" Place picker. Every page that
// lets a member choose a Place (compose's "from Place", onboarding/settings'
// default Place, shout/'s carry-to-a-new-Place destination) used to offer
// only the curated PLACES grid, then a flat static world silhouette you
// could tap once. This opens a real zoomable slippy map (Leaflet + OSM-
// derived tiles, loaded from CDN on first open — nothing shipped in the
// bundle) so a member can zoom all the way into a neighborhood before
// dropping a pin, or type a place name to jump straight there. The tap (or
// search result) still turns into a real Place via geohashPlaceId() +
// reverseGeocode(), and the caller still gets back a plain Place object —
// same shape as any entry in PLACES — ready for searchPlaces()'s `extra`
// param or straight into placeForRecord(). Public API (pickPlaceOnMap)
// unchanged, so every caller needed zero changes.

import { geohashPlaceId } from "./geohash.js";
import { reverseGeocode, flagEmoji } from "./geocode.js";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
// CARTO's Voyager tiles are OpenStreetMap data (the brief's "open street
// map or some other provider"), served off Carto's CDN rather than
// hotlinking osm.org's own tile servers directly — same call the
// littleguys site already made for the exact same reason (OSM's tile
// usage policy asks bulk consumers not to hit tile.openstreetmap.org
// directly). Voyager carries street labels, which is what actually makes
// zooming in useful for picking a granular spot.
// Exported (with loadLeaflet) so every map in the app — not just this
// picker — uses the same tiles and the same cached CDN load; map/'s world
// view imports these too rather than re-fetching Leaflet a second time.
export const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const SEARCH_MIN_LEN = 3;
const SEARCH_DEBOUNCE_MS = 400;
export const WORLD_SEARCH_MIN_LEN = SEARCH_MIN_LEN;
export const WORLD_SEARCH_DEBOUNCE_MS = SEARCH_DEBOUNCE_MS;

function shortPlaceName(r) {
  const a = r.address || {};
  const locality = a.city || a.town || a.village || a.municipality || a.county || a.state || r.name || "";
  const country = a.country || "";
  let name = [locality, country].filter(Boolean).join(", ");
  if (!name) name = r.display_name || "";
  if (name.length > 120) name = name.slice(0, 117) + "…";
  return name;
}

/** Searches real-world places by typed name (Nominatim, same free OSM
 *  geocoder the in-modal search uses) and returns Place-shaped objects
 *  `{id, name, emoji, lat, lng}` — the same shape as a PLACES entry or a
 *  pickPlaceOnMap() result. Lets every plain "search Places…" box search
 *  any real city directly, without a member having to open the 📍 map modal
 *  first just to reach a place outside the curated list. Empty query or a
 *  network failure both resolve to `[]` rather than throwing, so a caller
 *  can always just merge this into whatever it's already rendering. */
export async function searchWorldPlaces(query, { limit = 6 } = {}) {
  const q = String(query || "").trim();
  if (q.length < SEARCH_MIN_LEN) return [];
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&limit=${limit}&addressdetails=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const results = await res.json();
    return results.map((r) => {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      return { id: geohashPlaceId(lat, lng), name: shortPlaceName(r), emoji: flagEmoji(r.address?.country_code) || "📍", lat, lng };
    });
  } catch {
    return [];
  }
}

let leafletPromise = null;
/** Loads Leaflet's CSS + JS from CDN exactly once, however many times it's
 *  requested across the page's lifetime — shared by the picker and by
 *  map/'s world view. */
export function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("couldn't load the map"));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .mp-overlay { position: fixed; inset: 0; background: #0f14198c; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    /* max-height + overflow-y so a phone screen too short for title+hint+map+
       actions all at once (especially with the keyboard up) scrolls instead
       of silently pushing "use this Place" past the bottom of the viewport
       where nothing can reach it — that dead button was the actual bug, not
       the click handler. .mp-actions is sticky so it stays reachable without
       having to scroll all the way down first. */
    .mp-modal { background: var(--panel-solid); border: 1px solid var(--faint); border-radius: 14px; padding: 1rem; max-width: 680px; width: 100%; max-height: 92vh; overflow-y: auto; }
    .mp-title { margin: 0 0 0.5rem; font-size: 1.05rem; }
    .mp-hint { margin: 0 0 0.6rem; font-size: 0.8rem; color: var(--muted); }
    .mp-search-row { position: relative; margin-bottom: 0.6rem; }
    .mp-search-row input { width: 100%; box-sizing: border-box; }
    .mp-search-drop { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 1200; background: var(--panel-solid); color: inherit; border: 1px solid var(--faint); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.25); overflow-y: auto; max-height: 220px; font-size: 0.85rem; }
    .mp-search-item { padding: 0.5em 0.7em; cursor: pointer; }
    .mp-search-item:hover, .mp-search-item.active { background: rgba(0,0,0,0.06); }
    .mp-search-empty { padding: 0.5em 0.7em; opacity: 0.6; }
    .mp-map { position: relative; width: 100%; aspect-ratio: 2 / 1.1; border: 1px solid var(--faint); border-radius: 10px; overflow: hidden; background: #dcefff; }
    .mp-map .leaflet-container { width: 100%; height: 100%; font: inherit; cursor: crosshair; }
    .mp-panel { margin-top: 0.7rem; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .mp-panel .mp-name { font-size: 0.9rem; flex: 1 1 200px; }
    .mp-actions { position: sticky; bottom: 0; margin-top: 0.7rem; padding-top: 0.7rem; background: var(--panel-solid); border-top: 1px solid var(--faint); display: flex; gap: 0.5rem; justify-content: flex-end; }
  `;
  document.head.appendChild(style);
}

/** Opens the map-picker modal. Resolves with `{id, name, emoji, lat, lng}`
 *  (numeric lat/lng, same shape as a PLACES entry) if the member confirms a
 *  tap or search pick, or `null` if they cancel. */
export function pickPlaceOnMap() {
  injectStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "mp-overlay";
    overlay.innerHTML = `
      <div class="mp-modal">
        <h3 class="mp-title">pick a Place on the map</h3>
        <p class="mp-hint">search a place to jump there, then zoom in and tap the exact spot — this isn't limited to the curated list.</p>
        <div class="mp-search-row">
          <input id="mpSearch" placeholder="search a place by name…" autocomplete="off" />
        </div>
        <div class="mp-map" id="mpMap"></div>
        <div class="mp-panel" id="mpPanel" style="display:none">
          <span class="mp-name" id="mpName"></span>
        </div>
        <div class="mp-actions">
          <button class="btn" id="mpCancel" type="button">cancel</button>
          <button class="btn primary" id="mpUse" type="button" disabled>use this Place</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const mapEl = overlay.querySelector("#mpMap");
    const searchInput = overlay.querySelector("#mpSearch");
    const panelEl = overlay.querySelector("#mpPanel");
    const nameEl = overlay.querySelector("#mpName");
    const useBtn = overlay.querySelector("#mpUse");
    const cancelBtn = overlay.querySelector("#mpCancel");

    let picked = null; // {id, lat, lng, name, emoji}
    let requestId = 0;
    let map = null;
    let marker = null;

    function close(result) {
      document.removeEventListener("mousedown", onDocMousedown);
      overlay.remove();
      resolve(result);
    }

    async function onPick(lat, lng) {
      lat = Math.max(-90, Math.min(90, lat));
      lng = Math.max(-180, Math.min(180, lng));
      if (window.L) {
        const icon = window.L.divIcon({ html: "📍", className: "mp-pin-icon", iconSize: [28, 28], iconAnchor: [14, 26] });
        if (marker) marker.setLatLng([lat, lng]);
        else marker = window.L.marker([lat, lng], { icon }).addTo(map);
      }
      panelEl.style.display = "";
      useBtn.disabled = true;
      nameEl.textContent = "looking up name…";
      picked = null;

      const myRequest = ++requestId;
      const geo = await reverseGeocode(lat, lng);
      if (myRequest !== requestId) return; // a later pick superseded this lookup

      picked = { id: geohashPlaceId(lat, lng), name: geo.name, emoji: geo.emoji, lat, lng };
      nameEl.textContent = `${geo.emoji} ${geo.name}`;
      useBtn.disabled = false;
    }

    loadLeaflet()
      .then((L) => {
        map = L.map(mapEl, { attributionControl: true, zoomControl: true }).setView([20, 0], 2);
        L.tileLayer(TILE_URL, { maxZoom: 19, subdomains: "abcd", attribution: TILE_ATTRIBUTION }).addTo(map);
        map.on("click", (e) => onPick(e.latlng.lat, e.latlng.lng));
        setTimeout(() => map.invalidateSize(), 0);
      })
      .catch((err) => {
        mapEl.textContent = err.message;
        mapEl.style.display = "flex";
        mapEl.style.alignItems = "center";
        mapEl.style.justifyContent = "center";
      });

    // --- search: jump the map to a typed place name (Nominatim, OSM's own
    // free geocoder) — picking a result flies there and drops a pin, same
    // as a direct tap, so it still goes through reverseGeocode() for a name
    // consistent with the rest of the app. ---
    let searchDebounce = null;
    let searchAbort = null;
    let searchDrop = null;

    function closeSearchDrop() {
      if (searchDrop) { searchDrop.remove(); searchDrop = null; }
    }

    function renderSearchDrop(results) {
      closeSearchDrop();
      searchDrop = document.createElement("div");
      searchDrop.className = "mp-search-drop";
      if (!results.length) {
        searchDrop.innerHTML = `<div class="mp-search-empty">no matches</div>`;
      } else {
        searchDrop.innerHTML = results
          .map((r, i) => `<div class="mp-search-item" data-i="${i}">${escapeHtml(r.display_name)}</div>`)
          .join("");
        [...searchDrop.querySelectorAll(".mp-search-item")].forEach((el) => {
          el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const r = results[Number(el.dataset.i)];
            closeSearchDrop();
            searchInput.value = r.display_name;
            const lat = Number(r.lat);
            const lng = Number(r.lon);
            if (map) map.setView([lat, lng], 13);
            onPick(lat, lng);
          });
        });
      }
      overlay.querySelector(".mp-search-row").appendChild(searchDrop);
    }

    async function runSearch(q) {
      if (searchAbort) searchAbort.abort();
      searchAbort = new AbortController();
      try {
        const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&limit=6`;
        const res = await fetch(url, { signal: searchAbort.signal });
        if (!res.ok) throw new Error("search failed");
        const results = await res.json();
        renderSearchDrop(results);
      } catch (e) {
        if (e.name !== "AbortError") closeSearchDrop();
      }
    }

    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      const q = searchInput.value.trim();
      if (q.length < SEARCH_MIN_LEN) { closeSearchDrop(); return; }
      searchDebounce = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
    });
    searchInput.addEventListener("blur", () => setTimeout(closeSearchDrop, 150));
    function onDocMousedown(e) {
      if (searchDrop && e.target !== searchInput && !searchDrop.contains(e.target)) closeSearchDrop();
    }
    document.addEventListener("mousedown", onDocMousedown);

    useBtn.addEventListener("click", () => picked && close(picked));
    cancelBtn.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

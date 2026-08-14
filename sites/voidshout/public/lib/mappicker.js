// mappicker.js — a reusable "tap anywhere on the map" Place picker. Every
// page that lets a member choose a Place (compose's "from Place",
// onboarding/settings' default Place, shout/'s carry-to-a-new-Place
// destination) used to offer only the curated PLACES grid. This opens a
// modal with the same coastline/graticule the real /map/ page draws
// (WORLD_LAND_PATH, project()'s exact equirectangular formula) so a tap
// lands on real ground, turns the tap into a real Place via unproject() +
// geohashPlaceId() + reverseGeocode(), and hands the caller back a plain
// Place object — the same shape as any entry in PLACES — ready to pass to
// searchPlaces()'s `extra` param or straight into placeForRecord().

import { WORLD_LAND_PATH } from "./worldmap-data.js";
import { unproject } from "./places.js";
import { geohashPlaceId } from "./geohash.js";
import { reverseGeocode } from "./geocode.js";

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .mp-overlay { position: fixed; inset: 0; background: #0f14198c; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .mp-modal { background: var(--panel-solid); border: 1px solid var(--faint); border-radius: 14px; padding: 1rem; max-width: 640px; width: 100%; }
    .mp-title { margin: 0 0 0.5rem; font-size: 1.05rem; }
    .mp-hint { margin: 0 0 0.6rem; font-size: 0.8rem; color: var(--muted); }
    .mp-map { position: relative; width: 100%; aspect-ratio: 2 / 1; background: linear-gradient(180deg, #eaf5ff, #dcefff 60%, #eef7ff); border: 1px solid var(--faint); border-radius: 10px; overflow: hidden; cursor: crosshair; }
    .mp-map svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .mp-map .mp-land { fill: #cfe4d8; stroke: #9fc2ae; stroke-width: 1; }
    .mp-pin { position: absolute; transform: translate(-50%, -100%); font-size: 1.6rem; filter: drop-shadow(var(--pin-glow)); pointer-events: none; }
    .mp-panel { margin-top: 0.7rem; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .mp-panel .mp-name { font-size: 0.9rem; flex: 1 1 200px; }
    .mp-actions { margin-top: 0.7rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
  `;
  document.head.appendChild(style);
}

/** Opens the map-picker modal. Resolves with `{id, name, emoji, lat, lng}`
 *  (numeric lat/lng, same shape as a PLACES entry) if the member confirms a
 *  tap, or `null` if they cancel. */
export function pickPlaceOnMap() {
  injectStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "mp-overlay";
    overlay.innerHTML = `
      <div class="mp-modal">
        <h3 class="mp-title">pick a Place on the map</h3>
        <p class="mp-hint">tap anywhere — this isn't limited to the curated list.</p>
        <div class="mp-map" id="mpMap">
          <svg viewBox="0 0 1000 500"><path class="mp-land" d="${WORLD_LAND_PATH}" /></svg>
          <span class="mp-pin" id="mpPin" style="display:none">📍</span>
        </div>
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
    const pinEl = overlay.querySelector("#mpPin");
    const panelEl = overlay.querySelector("#mpPanel");
    const nameEl = overlay.querySelector("#mpName");
    const useBtn = overlay.querySelector("#mpUse");
    const cancelBtn = overlay.querySelector("#mpCancel");

    let picked = null; // {lat, lng, name, emoji}
    let requestId = 0;

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    mapEl.addEventListener("click", async (e) => {
      const rect = mapEl.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      const { lat, lng } = unproject(xPct, yPct);

      pinEl.style.left = `${xPct}%`;
      pinEl.style.top = `${yPct}%`;
      pinEl.style.display = "";
      panelEl.style.display = "";
      useBtn.disabled = true;
      nameEl.textContent = "looking up name…";
      picked = null;

      const myRequest = ++requestId;
      const geo = await reverseGeocode(lat, lng);
      if (myRequest !== requestId) return; // a later tap superseded this lookup

      picked = { id: geohashPlaceId(lat, lng), name: geo.name, emoji: geo.emoji, lat, lng };
      pinEl.textContent = geo.emoji;
      nameEl.textContent = `${geo.emoji} ${geo.name}`;
      useBtn.disabled = false;
    });

    useBtn.addEventListener("click", () => picked && close(picked));
    cancelBtn.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
  });
}

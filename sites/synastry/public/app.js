import { planetPositions, angles, signOf } from "./lib/astro.js";
import {
  BODIES, BODY_META, placements, temperament, synastryAspects, natalAspects, synastryBlurb,
  houseOverlay, houseOverlayEntries, houseOverlayBlurb,
} from "./lib/synastry.js";
import { initScene } from "./lib/scene.js";

const $ = (id) => document.getElementById(id);

// ---- UTC offset options -------------------------------------------------
const OFFSETS = [
  -12, -11, -10, -9.5, -9, -8, -7, -6, -5, -4, -3.5, -3, -2, -1, 0,
  1, 2, 3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 8, 8.75, 9, 9.5, 10, 10.5, 11, 12, 12.75, 13, 14,
];
function offsetLabel(h) {
  const sign = h >= 0 ? "+" : "-";
  const abs = Math.abs(h);
  const hh = String(Math.floor(abs)).padStart(2, "0");
  const mm = String(Math.round((abs % 1) * 60)).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}
function fillOffsetSelect(sel, def) {
  for (const h of OFFSETS) {
    const opt = document.createElement("option");
    opt.value = String(h);
    opt.textContent = offsetLabel(h);
    if (h === def) opt.selected = true;
    sel.appendChild(opt);
  }
}
const browserGuess = -Math.round((new Date().getTimezoneOffset() / 60) * 4) / 4;
fillOffsetSelect($("a-offset"), OFFSETS.includes(browserGuess) ? browserGuess : 0);
fillOffsetSelect($("b-offset"), OFFSETS.includes(browserGuess) ? browserGuess : 0);

// ---- geocoding ------------------------------------------------------------
function wireGeocode(prefix) {
  const input = $(`${prefix}-place`);
  const btn = $(`${prefix}-geo-btn`);
  const status = $(`${prefix}-geo-status`);
  const results = $(`${prefix}-geo-results`);
  const state = { lat: null, lon: null };

  async function lookup() {
    const q = input.value.trim();
    results.innerHTML = "";
    if (!q) { status.textContent = ""; status.className = "geostatus"; return; }
    status.textContent = "looking up…";
    status.className = "geostatus";
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok || !data.results || !data.results.length) {
        status.textContent = "no match — you can skip this or enter coordinates aren't needed for planets, only houses";
        status.className = "geostatus err";
        return;
      }
      status.textContent = `${data.results.length} match${data.results.length > 1 ? "es" : ""} — pick one`;
      status.className = "geostatus";
      for (const r of data.results) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = r.name;
        b.addEventListener("click", () => {
          state.lat = r.lat;
          state.lon = r.lon;
          input.value = r.name;
          results.innerHTML = "";
          status.textContent = `✓ resolved (${r.lat.toFixed(2)}, ${r.lon.toFixed(2)})`;
          status.className = "geostatus ok";
        });
        results.appendChild(b);
      }
    } catch (e) {
      status.textContent = "lookup failed — planets still work without a place, houses won't";
      status.className = "geostatus err";
    }
  }
  btn.addEventListener("click", lookup);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } });
  input.addEventListener("input", () => { state.lat = null; state.lon = null; status.textContent = ""; status.className = "geostatus"; });
  return state;
}
const geoA = wireGeocode("a");
const geoB = wireGeocode("b");

// ---- scene ------------------------------------------------------------
const canvasWrap = $("canvas-wrap");
const scene = initScene(canvasWrap);
$("rotate-toggle").addEventListener("change", (e) => scene.setAutoRotate(e.target.checked));

// ---- chart computation ------------------------------------------------
function readPerson(prefix, geo) {
  const name = $(`${prefix}-name`).value.trim() || (prefix === "a" ? "Person A" : "Person B");
  const date = $(`${prefix}-date`).value;
  const time = $(`${prefix}-time`).value || "12:00";
  const offset = parseFloat($(`${prefix}-offset`).value);
  return { name, date, time, offset, lat: geo.lat, lon: geo.lon, place: $(`${prefix}-place`).value.trim() };
}

function toUtcDate(dateStr, timeStr, offsetHours) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const localMs = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(localMs - offsetHours * 3600000);
}

function buildChart(person) {
  const utc = toUtcDate(person.date, person.time, person.offset);
  const pos = planetPositions(utc);
  const place = placements(pos);
  const temper = temperament(pos);
  let ascLon = null, mcLon = null;
  if (person.lat != null && person.lon != null) {
    const a = angles(utc, person.lat, person.lon);
    ascLon = a.asc;
    mcLon = a.mc;
  }
  return { pos, place, temper, ascLon, mcLon, utc };
}

let lastResult = null;

function renderPlacements(containerId, chart, color) {
  const el = $(containerId);
  let rows = BODIES.map((b) => {
    const p = chart.place[b];
    return `<tr><td class="glyph" style="color:${color}">${BODY_META[b].glyph}</td><td>${BODY_META[b].name}</td><td>${p.sign} ${p.degreeInSign.toFixed(1)}°</td></tr>`;
  }).join("");
  if (chart.ascLon != null) {
    const asc = signOf(chart.ascLon);
    rows += `<tr><td class="glyph" style="color:${color}">ASC</td><td>Ascendant</td><td>${asc.sign} ${asc.degreeInSign.toFixed(1)}°</td></tr>`;
  }
  if (chart.mcLon != null) {
    const mc = signOf(chart.mcLon);
    rows += `<tr><td class="glyph" style="color:${color}">MC</td><td>Midheaven</td><td>${mc.sign} ${mc.degreeInSign.toFixed(1)}°</td></tr>`;
  }
  el.innerHTML = `<table class="placements-table"><tbody>${rows}</tbody></table>`;
}

// House overlay: each person's planets land somewhere in the other's chart —
// a whole-sign house per body — once that other person's Ascendant is known
// (i.e. they entered a birth place). Either direction can be missing; render
// whichever side(s) are available and hide the panel only if neither is.
function renderHouseOverlays(posA, posB, ascA, ascB, nameA, nameB) {
  const panel = $("house-panel");
  const overlayAinB = houseOverlay(posA, ascB);
  const overlayBinA = houseOverlay(posB, ascA);
  const entriesAinB = houseOverlayEntries(overlayAinB).slice(0, 6);
  const entriesBinA = houseOverlayEntries(overlayBinA).slice(0, 6);

  if (!entriesAinB.length && !entriesBinA.length) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";

  function list(entries, from, into) {
    if (!entries.length) {
      return `<p class="empty-note" style="padding:8px 0">enter a birth place for ${escapeHtml(into)} to see where ${escapeHtml(from)}'s planets land.</p>`;
    }
    return `<ul class="aspect-list">${entries.map((e) =>
      `<li>${escapeHtml(houseOverlayBlurb(from, into, e.body, e.house))}</li>`
    ).join("")}</ul>`;
  }

  $("house-a-in-b").innerHTML = `<h3>${escapeHtml(nameA)}'s planets, in ${escapeHtml(nameB)}'s houses</h3>${list(entriesAinB, nameA, nameB)}`;
  $("house-b-in-a").innerHTML = `<h3>${escapeHtml(nameB)}'s planets, in ${escapeHtml(nameA)}'s houses</h3>${list(entriesBinA, nameB, nameA)}`;
}

function renderTemperament(containerId, name, temper) {
  const el = $(containerId);
  const colors = { fire: "#ef7d7d", earth: "#c9a15c", air: "#e0d060", water: "#5b9bf0" };
  const order = ["fire", "earth", "air", "water"];
  const bars = order.map((k) => `<div style="width:${(temper.elementPct[k] * 100).toFixed(1)}%;background:${colors[k]}"></div>`).join("");
  const legend = order.map((k) => `<span>${k} ${(temper.elementPct[k] * 100).toFixed(0)}%</span>`).join("");
  el.innerHTML = `
    <b>${escapeHtml(name)}</b> — <span style="color:var(--fg)">${temper.temperament.name}</span>, ${temper.dominantModality}
    <div class="temper-bar">${bars}</div>
    <div class="temper-legend">${legend}</div>
    <div class="temper-blurb">${temper.temperament.blurb}.</div>
  `;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function withAngles(pos, ascLon, mcLon) {
  const extra = {};
  if (ascLon != null) extra.asc = { lon: ascLon };
  if (mcLon != null) extra.mc = { lon: mcLon };
  return Object.keys(extra).length ? { ...pos, ...extra } : pos;
}

function runChart(pushUrl) {
  const a = readPerson("a", geoA);
  const b = readPerson("b", geoB);
  if (!a.date || !b.date) return;

  const chartA = buildChart(a);
  const chartB = buildChart(b);

  const posAWithAngles = withAngles(chartA.pos, chartA.ascLon, chartA.mcLon);
  const posBWithAngles = withAngles(chartB.pos, chartB.ascLon, chartB.mcLon);
  const synastry = synastryAspects(posAWithAngles, posBWithAngles);
  const natalA = natalAspects(chartA.pos);
  const natalB = natalAspects(chartB.pos);
  const showNatal = $("natal-toggle").checked;

  scene.update({
    nameA: a.name, nameB: b.name,
    posA: posAWithAngles, posB: posBWithAngles,
    ascA: chartA.ascLon, ascB: chartB.ascLon,
    synastry, natalA, natalB, showNatal,
    maxSynastry: 40,
  });
  $("empty-note").style.display = "none";

  $("readouts").style.display = "grid";
  renderPlacements("placements-a", chartA, "var(--a)");
  renderPlacements("placements-b", chartB, "var(--b)");
  renderTemperament("temperament-a", a.name, chartA.temper);
  renderTemperament("temperament-b", b.name, chartB.temper);

  $("aspects-panel").style.display = "block";
  const top = synastry.slice(0, 14);
  $("aspect-list").innerHTML = top.map((entry) => {
    const blurb = synastryBlurb(entry, a.name, b.name);
    return `<li><span class="tag ${entry.aspect.quality}">${entry.aspect.name}</span>${escapeHtml(blurb)}</li>`;
  }).join("") || "<li>No aspects landed within orb — a genuinely quiet chart pair.</li>";

  renderHouseOverlays(posAWithAngles, posBWithAngles, chartA.ascLon, chartB.ascLon, a.name, b.name);

  $("share-row").style.display = "flex";
  lastResult = { a, b, synastry, chartA, chartB };

  if (pushUrl) updateUrl(a, b, showNatal);
}

$("chart-btn").addEventListener("click", () => runChart(true));
$("natal-toggle").addEventListener("change", () => runChart(false));

// ---- URL state (shareable) --------------------------------------------
function updateUrl(a, b, showNatal) {
  const p = new URLSearchParams();
  p.set("an", a.name); p.set("ad", a.date); p.set("at", a.time); p.set("ao", a.offset);
  if (a.place) p.set("ap", a.place);
  if (a.lat != null) { p.set("alat", a.lat.toFixed(4)); p.set("alon", a.lon.toFixed(4)); }
  p.set("bn", b.name); p.set("bd", b.date); p.set("bt", b.time); p.set("bo", b.offset);
  if (b.place) p.set("bp", b.place);
  if (b.lat != null) { p.set("blat", b.lat.toFixed(4)); p.set("blon", b.lon.toFixed(4)); }
  if (showNatal) p.set("nat", "1");
  history.replaceState(null, "", `?${p.toString()}`);
}

function loadFromUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.has("ad") || !p.has("bd")) return false;
  $("a-name").value = p.get("an") || "";
  $("a-date").value = p.get("ad") || "";
  $("a-time").value = p.get("at") || "12:00";
  if (p.has("ao")) $("a-offset").value = p.get("ao");
  if (p.has("ap")) $("a-place").value = p.get("ap");
  if (p.has("alat")) { geoA.lat = parseFloat(p.get("alat")); geoA.lon = parseFloat(p.get("alon")); }

  $("b-name").value = p.get("bn") || "";
  $("b-date").value = p.get("bd") || "";
  $("b-time").value = p.get("bt") || "12:00";
  if (p.has("bo")) $("b-offset").value = p.get("bo");
  if (p.has("bp")) $("b-place").value = p.get("bp");
  if (p.has("blat")) { geoB.lat = parseFloat(p.get("blat")); geoB.lon = parseFloat(p.get("blon")); }

  if (p.get("nat") === "1") $("natal-toggle").checked = true;
  return true;
}

if (loadFromUrl()) runChart(false);

// ---- sharing ------------------------------------------------------------
function shareText() {
  if (!lastResult) return "";
  const { a, b, synastry } = lastResult;
  const url = location.href;
  const n = synastry.length;
  const prefix = `${a.name} × ${b.name}: ${n} synastry aspect${n === 1 ? "" : "s"} mapped in 3D — `;
  const budget = 300 - prefix.length - url.length - 1;
  const tail = budget > 10 ? "see the shape of it" : "";
  return `${prefix}${tail} ${url}`.trim();
}

$("share-bluesky").addEventListener("click", (e) => {
  if (!lastResult) { e.preventDefault(); return; }
  $("share-bluesky").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
});

$("share-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    const btn = $("share-link");
    const old = btn.textContent;
    btn.textContent = "copied!";
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch {}
});

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  const probe = new File([""], "probe.png", { type: "image/png" });
  try { return navigator.canShare({ files: [probe] }); } catch { return false; }
}

async function downloadCapture() {
  const dataUrl = scene.capture();
  const blob = dataUrlToBlob(dataUrl);
  const filename = "synastry.png";
  if (canShareFiles() && lastResult) {
    const file = new File([blob], filename, { type: "image/png" });
    try {
      await navigator.share({ files: [file], text: shareText(), title: "synastry" });
      return;
    } catch {}
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

$("capture-btn").addEventListener("click", downloadCapture);
$("share-image").addEventListener("click", downloadCapture);

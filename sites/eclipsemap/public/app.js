import { PLANETS, MOONS, planetByKey, moonsOf, AU_KM } from "./lib/data.js";
import { daysSinceEpoch } from "./lib/orbits.js";
import {
  planetHelioPosKm,
  moonPosKm,
  transitGeometry,
  shadowGeometry,
  classifyTransit,
  classifyShadow,
  findMoonTransits,
  findMoonShadows,
  findPlanetTransitsFromEarth,
} from "./lib/eclipses.js";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const CX = W / 2, CY = H / 2;

const els = {
  crumbs: document.getElementById("crumbs"),
  hoverLabel: document.getElementById("hover-label"),
  nowReadout: document.getElementById("now-readout"),
  playBtn: document.getElementById("playBtn"),
  speed: document.getElementById("speed"),
  speedLabel: document.getElementById("speedLabel"),
  jumpToday: document.getElementById("jumpToday"),
  dateInput: document.getElementById("dateInput"),
  setDate: document.getElementById("setDate"),
  eventsTitle: document.getElementById("events-title"),
  moonChips: document.getElementById("moon-chips"),
  rangeYears: document.getElementById("rangeYears"),
  recompute: document.getElementById("recompute"),
  eventsList: document.getElementById("events-list"),
  shareBluesky: document.getElementById("shareBluesky"),
  copyLink: document.getElementById("copyLink"),
};

let simMs = Date.now();
let playing = false;
let lastTs = null;
const SPEEDS = [0.01, 0.1, 1, 5, 30, 180, 365];
const SPEED_LABELS = ["real-ish (0.01 d/s)", "0.1 day/s", "1 day/s", "5 days/s", "30 days/s", "180 days/s", "1 year/s"];
let speedIdx = 2;

let view = "system"; // "system" | "planet"
let currentPlanetKey = null;
let focus = null; // {type:'moon', planetKey, moonKey} | {type:'earthTransit', planetKey}
let hitBodies = []; // rebuilt every render(): [{key, name, x, y, r, kind}]

// ---------- projection helpers ----------

function mapRadius(value, minVal, maxVal, minPx, maxPx) {
  const t = (Math.sqrt(value) - Math.sqrt(minVal)) / (Math.sqrt(maxVal) - Math.sqrt(minVal));
  return minPx + Math.max(0, Math.min(1, t)) * (maxPx - minPx);
}

function planetPxRadius(radiusKm) {
  const t = (Math.log(radiusKm) - Math.log(1188)) / (Math.log(70000) - Math.log(1188));
  return 4 + Math.max(0, Math.min(1, t)) * 11;
}

function moonPxRadius(radiusKm) {
  const t = (Math.log(radiusKm) - Math.log(6)) / (Math.log(2600) - Math.log(6));
  return 2.5 + Math.max(0, Math.min(1, t)) * 7;
}

// ---------- drawing ----------

function clear() {
  ctx.clearRect(0, 0, W, H);
}

function drawOrbitRing(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff14";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBody(x, y, r, color, glow) {
  if (glow) {
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, Math.PI * 2);
    ctx.fillStyle = glow + "55";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function statusColor(classification) {
  return { total: "#ff6b6b", annular: "#ffcf6b", partial: "#6bb8ff", transit: "#9d7bff", penumbral: "#7d8bb0" }[classification] || null;
}

function renderSystemView() {
  hitBodies = [];
  const days = daysSinceEpoch(simMs);
  const minA = 0.35, maxA = 41;

  drawBody(CX, CY, 14, "#fff2c9", "#ffcf6b");
  hitBodies.push({ key: "sun", name: "Sun", x: CX, y: CY, r: 14 });

  for (const p of PLANETS) {
    const pos = planetHelioPosKm(p, days);
    const xAU = pos.x / AU_KM, yAU = pos.y / AU_KM;
    const trueR = Math.hypot(xAU, yAU);
    const ang = Math.atan2(yAU, xAU);
    const pxR = mapRadius(trueR, minA, maxA, 34, 430);
    const orbitPxR = mapRadius(p.a, minA, maxA, 34, 430);
    drawOrbitRing(CX, CY, orbitPxR);
    const x = CX + pxR * Math.cos(ang);
    const y = CY + pxR * Math.sin(ang);
    const r = planetPxRadius(p.radius);
    const isFocusEarthTransit = focus && focus.type === "earthTransit" && focus.planetKey === p.key;
    drawBody(x, y, r, p.color, isFocusEarthTransit ? "#9d7bff" : null);
    hitBodies.push({ key: p.key, name: p.name, x, y, r, kind: "planet" });
  }
}

function renderPlanetView() {
  hitBodies = [];
  const planet = planetByKey(currentPlanetKey);
  const days = daysSinceEpoch(simMs);
  const pPos = planetHelioPosKm(planet, days);

  const cRadius = 34;
  drawBody(CX, CY, cRadius, planet.color, null);
  hitBodies.push({ key: planet.key, name: planet.name, x: CX, y: CY, r: cRadius, kind: "planetCenter" });

  // Sun-direction arrow (2D projection, ignoring the out-of-plane component).
  const sunDirX = -pPos.x, sunDirY = -pPos.y;
  const sunAngle = Math.atan2(sunDirY, sunDirX);
  const arrowLen = 60;
  ctx.save();
  ctx.strokeStyle = "#ffcf6bcc";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(CX + cRadius * Math.cos(sunAngle), CY + cRadius * Math.sin(sunAngle));
  ctx.lineTo(CX + (cRadius + arrowLen) * Math.cos(sunAngle), CY + (cRadius + arrowLen) * Math.sin(sunAngle));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffcf6b";
  ctx.font = "12px monospace";
  const lx = CX + (cRadius + arrowLen + 10) * Math.cos(sunAngle);
  const ly = CY + (cRadius + arrowLen + 10) * Math.sin(sunAngle);
  ctx.fillText("☉ sun", lx - 14, ly + 4);
  ctx.restore();

  const moons = moonsOf(planet.key);
  const as = moons.map((m) => m.a);
  const minA = Math.min(...as) * 0.85, maxA = Math.max(...as) * 1.05;

  for (const m of moons) {
    const localPos = moonPosKm(m, pPos, days).local;
    const trueR = Math.hypot(localPos.x, localPos.y);
    const ang = Math.atan2(localPos.y, localPos.x);
    const pxR = mapRadius(trueR, minA, maxA, 70, 420);
    const orbitPxR = mapRadius(m.a, minA, maxA, 70, 420);
    drawOrbitRing(CX, CY, orbitPxR);
    const x = CX + pxR * Math.cos(ang);
    const y = CY + pxR * Math.sin(ang);
    const r = moonPxRadius(m.radius);

    let glow = null;
    if (focus && focus.type === "moon" && focus.moonKey === m.key) {
      const t = transitGeometry(pPos, moonPosKm(m, pPos, days), m.radius);
      const tc = classifyTransit(t.sep, t.sunAng, t.fgAng);
      const s = shadowGeometry(pPos, localPos, planet.radius);
      const sc = classifyShadow(s.rho, s.rU, s.rP, m.radius);
      glow = statusColor(tc) || statusColor(sc) || "#ffffff88";
    }
    drawBody(x, y, r, focus && focus.type === "moon" && focus.moonKey === m.key ? "#fff" : "#c8d0f0", glow);
    hitBodies.push({ key: m.key, name: m.name, x, y, r, kind: "moon" });
  }
}

function render() {
  clear();
  if (view === "system") renderSystemView();
  else renderPlanetView();
  updateNowReadout();
}

// ---------- "right now" status ----------

function classDesc(c) {
  return { total: "totally eclipsing", annular: "annularly eclipsing", partial: "partially eclipsing", penumbral: "penumbrally shadowing" }[c] || c;
}

function computeNowStatus() {
  if (!focus) return { text: "Pick a planet on the map to explore its eclipses.", active: false };
  const days = daysSinceEpoch(simMs);

  if (focus.type === "moon") {
    const planet = planetByKey(focus.planetKey);
    const moon = MOONS.find((m) => m.key === focus.moonKey);
    const pPos = planetHelioPosKm(planet, days);
    const mPosFull = moonPosKm(moon, pPos, days);
    const t = transitGeometry(pPos, mPosFull, moon.radius);
    const tc = classifyTransit(t.sep, t.sunAng, t.fgAng);
    if (tc === "transit") return { text: `${moon.name} is transiting the Sun right now, as seen from ${planet.name}.`, active: true, classification: tc };
    if (tc) return { text: `${moon.name} is ${classDesc(tc)} the Sun right now, as seen from ${planet.name}.`, active: true, classification: tc };
    const s = shadowGeometry(pPos, mPosFull.local, planet.radius);
    const sc = classifyShadow(s.rho, s.rU, s.rP, moon.radius);
    if (sc) return { text: `${moon.name} is in ${planet.name}'s ${sc} shadow right now.`, active: true, classification: sc };
    return { text: `No eclipse involving ${moon.name} right now. Scrub time, or hit "find events" to jump to the next one.`, active: false };
  }

  if (focus.type === "earthTransit") {
    const fg = planetByKey(focus.planetKey);
    const earth = planetByKey("earth");
    const ePos = planetHelioPosKm(earth, days);
    const fPos = planetHelioPosKm(fg, days);
    const t = transitGeometry(ePos, fPos, fg.radius);
    const tc = classifyTransit(t.sep, t.sunAng, t.fgAng);
    if (tc) return { text: `${fg.name} is transiting the Sun right now, as seen from Earth. That's a rare one.`, active: true, classification: "transit" };
    return { text: `${fg.name} is not transiting the Sun right now — real transits are a handful of hours, once or twice a decade.`, active: false };
  }
  return { text: "", active: false };
}

function updateNowReadout() {
  const s = computeNowStatus();
  els.nowReadout.textContent = s.text;
  els.nowReadout.classList.toggle("active", !!s.active);
}

// ---------- breadcrumbs / moon chips ----------

function renderCrumbs() {
  els.crumbs.innerHTML = "";
  const sysBtn = document.createElement("button");
  sysBtn.textContent = "Solar System";
  sysBtn.addEventListener("click", () => {
    view = "system";
    currentPlanetKey = null;
    els.moonChips.innerHTML = "";
    render();
    renderCrumbs();
  });
  els.crumbs.appendChild(sysBtn);
  if (view === "planet") {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "›";
    els.crumbs.appendChild(sep);
    const cur = document.createElement("span");
    cur.className = "current";
    cur.textContent = planetByKey(currentPlanetKey).name;
    els.crumbs.appendChild(cur);
  }
}

function renderMoonChips() {
  els.moonChips.innerHTML = "";
  if (view !== "planet") return;
  const moons = moonsOf(currentPlanetKey);
  for (const m of moons) {
    const b = document.createElement("button");
    b.textContent = m.name;
    b.className = focus && focus.type === "moon" && focus.moonKey === m.key ? "active" : "";
    b.addEventListener("click", () => setMoonFocus(currentPlanetKey, m.key));
    els.moonChips.appendChild(b);
  }
}

// ---------- focus transitions ----------

function switchToPlanet(planetKey) {
  view = "planet";
  currentPlanetKey = planetKey;
  const moons = moonsOf(planetKey);
  renderCrumbs();
  if (moons.length) {
    setMoonFocus(planetKey, moons[0].key);
  } else {
    focus = null;
    els.moonChips.innerHTML = "";
    els.eventsTitle.textContent = "upcoming events";
    els.eventsList.innerHTML = '<div class="empty-note">This planet has no moons in the model.</div>';
    render();
  }
}

function setMoonFocus(planetKey, moonKey) {
  focus = { type: "moon", planetKey, moonKey };
  const moon = MOONS.find((m) => m.key === moonKey);
  const planet = planetByKey(planetKey);
  els.eventsTitle.textContent = `${moon.name} @ ${planet.name}`;
  renderMoonChips();
  render();
  computeAndRenderEvents();
}

function setEarthTransitFocus(planetKey) {
  focus = { type: "earthTransit", planetKey };
  view = "system";
  currentPlanetKey = null;
  els.moonChips.innerHTML = "";
  els.eventsTitle.textContent = `${planetByKey(planetKey).name} transits the Sun (seen from Earth)`;
  renderCrumbs();
  render();
  computeAndRenderEvents();
}

// ---------- events panel ----------

function fmtDate(ms) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function renderEventList(events, truncated, searchedDays) {
  els.eventsList.innerHTML = "";
  if (!events.length) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = `No events found in the searched window (~${Math.round(searchedDays)} days). Some bodies only eclipse in "seasons" that are years or decades apart — try scrubbing to a different start date.`;
    els.eventsList.appendChild(note);
    return;
  }
  for (const ev of events) {
    const card = document.createElement("div");
    card.className = `event-card k-${ev.classification}`;
    const label = ev.kind === "shadow" ? `${ev.cause}'s shadow on ${ev.body}` : `${ev.cause} crosses the Sun @ ${ev.body}`;
    card.innerHTML = `
      <div class="row1"><span>${fmtDate(ev.peakMs)}</span><span class="tag">${ev.classification}</span></div>
      <div class="meta">${label}${ev.durationHours ? ` · ~${ev.durationHours < 1 ? Math.round(ev.durationHours * 60) + " min" : ev.durationHours.toFixed(1) + " hr"}` : ""}</div>
    `;
    card.addEventListener("click", () => {
      simMs = ev.peakMs;
      playing = false;
      els.playBtn.textContent = "▶";
      syncDateInput();
      render();
    });
    els.eventsList.appendChild(card);
  }
  if (truncated) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = `Search capped at ~${Math.round(searchedDays)} days for performance — this body orbits fast enough that scanning further in-browser would be slow. Scrub the start date forward and search again to look further out.`;
    els.eventsList.appendChild(note);
  }
}

function computeAndRenderEvents() {
  if (!focus) return;
  els.eventsList.innerHTML = '<div class="empty-note">computing…</div>';
  const rangeYears = Number(els.rangeYears.value);
  const startMs = simMs;
  const endMs = simMs + rangeYears * 365 * 86400000;
  setTimeout(() => {
    if (focus.type === "moon") {
      const t = findMoonTransits(focus.moonKey, startMs, endMs);
      const s = findMoonShadows(focus.moonKey, startMs, endMs);
      const all = [...t.events, ...s.events].sort((a, b) => a.peakMs - b.peakMs);
      renderEventList(all, t.truncated || s.truncated, Math.min(t.searchedDays, s.searchedDays));
    } else if (focus.type === "earthTransit") {
      const t = findPlanetTransitsFromEarth(focus.planetKey, startMs, endMs);
      renderEventList(t.events, t.truncated, t.searchedDays);
    }
  }, 10);
}

// ---------- input wiring ----------

function canvasToLogical(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * W;
  const y = ((evt.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

function findHit(x, y) {
  let best = null, bestD = Infinity;
  for (const b of hitBodies) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < Math.max(b.r + 6, 10) && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

canvas.addEventListener("click", (evt) => {
  const { x, y } = canvasToLogical(evt);
  const hit = findHit(x, y);
  if (!hit) return;
  if (view === "system") {
    if (hit.key === "sun") return;
    const planet = planetByKey(hit.key);
    if (planet.hasMoons) switchToPlanet(hit.key);
    else setEarthTransitFocus(hit.key);
  } else {
    if (hit.kind === "planetCenter") {
      view = "system";
      currentPlanetKey = null;
      els.moonChips.innerHTML = "";
      renderCrumbs();
      render();
    } else if (hit.kind === "moon") {
      setMoonFocus(currentPlanetKey, hit.key);
    }
  }
});

canvas.addEventListener("mousemove", (evt) => {
  const { x, y } = canvasToLogical(evt);
  const hit = findHit(x, y);
  if (hit) {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / W;
    els.hoverLabel.style.left = rect.left - canvas.parentElement.getBoundingClientRect().left + hit.x * scale + "px";
    els.hoverLabel.style.top = rect.top - canvas.parentElement.getBoundingClientRect().top + hit.y * scale + "px";
    els.hoverLabel.textContent = hit.name;
    els.hoverLabel.style.display = "block";
    canvas.style.cursor = "pointer";
  } else {
    els.hoverLabel.style.display = "none";
    canvas.style.cursor = "default";
  }
});
canvas.addEventListener("mouseleave", () => (els.hoverLabel.style.display = "none"));

function syncDateInput() {
  const d = new Date(simMs);
  els.dateInput.value = d.toISOString().slice(0, 10);
}

els.playBtn.addEventListener("click", () => {
  playing = !playing;
  els.playBtn.textContent = playing ? "⏸" : "▶";
  lastTs = null;
});

els.speed.addEventListener("input", () => {
  speedIdx = Number(els.speed.value);
  els.speedLabel.textContent = SPEED_LABELS[speedIdx];
});
els.speedLabel.textContent = SPEED_LABELS[speedIdx];

els.jumpToday.addEventListener("click", () => {
  simMs = Date.now();
  syncDateInput();
  render();
});

els.setDate.addEventListener("click", () => {
  if (!els.dateInput.value) return;
  simMs = new Date(els.dateInput.value + "T00:00:00Z").getTime();
  render();
  if (focus) computeAndRenderEvents();
});

els.recompute.addEventListener("click", computeAndRenderEvents);

// ---------- sharing ----------

function buildShareText() {
  const s = computeNowStatus();
  const url = "https://eclipsemap.bisks.net/";
  if (s.active) return `right now: ${s.text} — real orbital mechanics, not a stock photo. explore every eclipse in the solar system → ${url}`;
  return `an interactive map of every eclipse the solar system has — Jupiter's moons, Phobos, Pluto & Charon, all computed from real orbital data → ${url}`;
}

function updateShareLink() {
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
}

els.copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    const old = els.copyLink.textContent;
    els.copyLink.textContent = "copied!";
    setTimeout(() => (els.copyLink.textContent = old), 1400);
  } catch {
    /* clipboard unavailable — no-op */
  }
});

// ---------- main loop ----------

function frame(ts) {
  if (playing) {
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    simMs += dt * SPEEDS[speedIdx] * 86400000;
    syncDateInput();
  }
  lastTs = ts;
  render();
  updateShareLink();
  requestAnimationFrame(frame);
}

syncDateInput();
renderCrumbs();
requestAnimationFrame(frame);

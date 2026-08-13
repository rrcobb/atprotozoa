// bigwalk is a static, client-side race. The public AppView supplies the
// moot roster; everything after that is local to this browser and handle.
import { moots } from "./lib/cluster.js";

const TRACK_METERS = 300;
const COUNTDOWN_MS = 3000;
const STEP_COOLDOWN_MS = 65;
const STEP_GAIN_MIN = 0.85;
const STEP_GAIN_MAX = 1.35;
const ELIM_LAG_METERS = 55;
const MAX_GHOSTS = 16;
const MAX_HISTORY = 12;
const LS_ME = "bigwalk:me";

const els = Object.fromEntries([
  "landing walk startForm handleInput landingStatus walkOwnerName walkKind walkStatus meName meEdit shareBtn copyBtn walkers track startRaceBtn countdown raceStatusLine ghostNote footControls footLeft footRight recordLine historyList resultsPanel resultsList rosterList cheerFlyLayer",
].flatMap((key) => [[key, document.getElementById(key)]]));

const room = {
  handle: "", owner: null, pool: [], kind: "moots", bestMs: null, bestBy: "", history: [], ghosts: [],
  race: null, lastFoot: "", finishOrder: 0,
};
const walkerEls = new Map();
let countdownTimer = null;
let raceTimer = null;

function cleanHandle(raw) {
  return (raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "").split(/[\/\s]/)[0].toLowerCase();
}
function setStatus(el, text, error = false) { el.textContent = text || ""; el.classList.toggle("error", error); }
function storageKey(kind) { return `bigwalk:${room.handle}:${kind}`; }
function readList(kind) {
  try { const value = JSON.parse(localStorage.getItem(storageKey(kind)) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function saveList(kind, value) { localStorage.setItem(storageKey(kind), JSON.stringify(value)); }
function loadLocal() {
  room.ghosts = readList("runs").filter((g) => g && g.finishMs > 0 && Array.isArray(g.samples)).slice(0, MAX_GHOSTS);
  room.history = readList("history").slice(0, MAX_HISTORY);
  room.bestMs = room.ghosts.reduce((best, g) => !best || g.finishMs < best ? g.finishMs : best, null);
  const best = room.ghosts.find((g) => g.finishMs === room.bestMs);
  room.bestBy = best?.displayName || "";
}
function ghostDistanceAt(g, elapsed) {
  if (elapsed <= 0) return 0;
  if (elapsed >= g.finishMs) return TRACK_METERS;
  let previous = g.samples[0] || [0, 0];
  for (const sample of g.samples) {
    if (sample[0] <= elapsed) previous = sample;
    else {
      const [t0, d0] = previous; const [t1, d1] = sample;
      return d0 + (d1 - d0) * ((elapsed - t0) / Math.max(1, t1 - t0));
    }
  }
  return previous[1];
}

function route() {
  const match = location.pathname.match(/^\/w\/([^/]+)\/?$/);
  if (match) startWalk(decodeURIComponent(match[1]));
  else { els.landing.hidden = false; els.walk.hidden = true; }
}
els.startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const handle = cleanHandle(els.handleInput.value);
  if (!handle) return;
  localStorage.setItem(LS_ME, handle);
  history.pushState({}, "", `/w/${encodeURIComponent(handle)}`);
  route();
});
window.addEventListener("popstate", route);

async function startWalk(handle) {
  stopRace();
  room.handle = cleanHandle(handle);
  els.landing.hidden = true; els.walk.hidden = false;
  els.walkOwnerName.textContent = room.handle;
  els.walkers.innerHTML = ""; walkerEls.clear();
  setStatus(els.walkStatus, `resolving @${room.handle}…`);
  try {
    const result = await moots(room.handle, { onStep: (step) => setStatus(els.walkStatus, step) });
    room.owner = result.self; room.pool = result.pool || []; room.kind = result.kind || "moots";
    loadLocal();
    els.walkOwnerName.textContent = room.owner.displayName || room.owner.handle;
    els.walkKind.textContent = room.pool.length ? `${room.pool.length} ${room.kind === "moots" ? "moots" : "riders"} in the pool` : "walking solo";
    setStatus(els.walkStatus, "");
    updateMeLabel(localStorage.getItem(LS_ME) || "a passerby");
    renderRoster(); renderRecord(); renderHistory(); renderLobby(); renderGhostNote();
  } catch (error) {
    setStatus(els.walkStatus, `couldn't find @${room.handle} — ${error.message || "check the handle"}`, true);
  }
}

function riderMeta(seat) { return seat === "owner" ? room.owner : room.pool.find((r) => r.did === seat); }
function pct(distance) { return `${Math.max(0, Math.min(1, distance / TRACK_METERS)) * 88}%`; }
function renderRoster() {
  els.rosterList.innerHTML = "";
  const entries = [{ seat: "owner", ...room.owner }, ...room.pool];
  for (const rider of entries) {
    const li = document.createElement("li"); li.textContent = `⚪ ${rider.displayName || rider.handle}`;
    els.rosterList.appendChild(li);
  }
  if (!entries.length) { const li = document.createElement("li"); li.textContent = "nobody here yet"; els.rosterList.appendChild(li); }
}
function makeWalker(w, ghost = false) {
  const meta = ghost ? w : riderMeta(w.seat) || {};
  const lane = document.createElement("div"); lane.className = "lane";
  const el = document.createElement("div"); el.className = `walker${ghost ? " ghost" : ""}`; el.style.left = pct(w.distance || 0);
  const figure = document.createElement("div"); figure.className = "figure";
  if (meta.avatar) { const img = document.createElement("img"); img.src = meta.avatar; img.alt = ""; img.loading = "lazy"; figure.appendChild(img); } else figure.textContent = ghost ? "👻" : "🚶";
  const tag = document.createElement("div"); tag.className = "tag"; tag.textContent = ghost ? `👻 ${meta.displayName || meta.handle || "ghost"}` : (w.displayName || meta.displayName || meta.handle || "you");
  el.append(figure, tag); lane.appendChild(el); walkerEls.set(w.seat, el); return lane;
}
function renderLobby() {
  els.walkers.innerHTML = ""; walkerEls.clear();
  for (const rider of [{ seat: "owner", ...room.owner }, ...room.pool]) els.walkers.appendChild(makeWalker({ seat: rider.seat || rider.did, distance: 0, displayName: rider.displayName }));
  els.startRaceBtn.hidden = false; els.startRaceBtn.disabled = false; els.footControls.hidden = true; els.countdown.hidden = true;
  els.raceStatusLine.textContent = "hit start whenever — your best local ghosts race too";
}
function renderRecord() { els.recordLine.textContent = room.bestMs ? `${(room.bestMs / 1000).toFixed(2)}s — ${room.bestBy}` : "nobody's finished yet"; }
function renderHistory() {
  els.historyList.innerHTML = "";
  if (!room.history.length) { const li = document.createElement("li"); li.textContent = "no walks yet"; els.historyList.appendChild(li); return; }
  for (const entry of room.history.slice().reverse()) { const li = document.createElement("li"); li.textContent = entry.winnerMs ? `${entry.winner} won in ${(entry.winnerMs / 1000).toFixed(2)}s (solo)` : "nobody finished"; els.historyList.appendChild(li); }
}
function renderGhostNote() { els.ghostNote.textContent = room.ghosts.length ? `${room.ghosts.length} ghost${room.ghosts.length === 1 ? "" : "s"} of your past runs are ready to race 👻` : "no ghosts recorded here yet — finish a walk and you'll leave one for next time"; }

function startRace() {
  if (room.race) return;
  const now = Date.now();
  room.lastFoot = ""; room.finishOrder = 0;
  room.race = { startedAt: now + COUNTDOWN_MS, distance: 0, samples: [[0, 0]], finished: false, eliminated: false, ghosts: room.ghosts.slice(0, 4) };
  els.walkers.innerHTML = ""; walkerEls.clear();
  els.walkers.appendChild(makeWalker({ seat: "you", distance: 0, displayName: localStorage.getItem(LS_ME) || "you" }));
  room.race.ghosts = room.race.ghosts.map((ghost, index) => ({ ...ghost, seat: `ghost:${index}` }));
  for (const ghost of room.race.ghosts) els.walkers.appendChild(makeWalker(ghost, true));
  els.startRaceBtn.hidden = true; els.footControls.hidden = false; els.raceStatusLine.textContent = "";
  beginCountdown();
  raceTimer = setInterval(tickRace, 80);
}
function beginCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const remaining = room.race.startedAt - Date.now();
    if (remaining <= 0) { clearInterval(countdownTimer); els.countdown.hidden = true; els.raceStatusLine.textContent = "GO — alternate L/R to walk!"; return; }
    els.countdown.hidden = false; els.countdown.textContent = Math.ceil(remaining / 1000);
  }, 100);
}
function tickRace() {
  if (!room.race || Date.now() < room.race.startedAt) return;
  const elapsed = Date.now() - room.race.startedAt;
  for (const ghost of room.race.ghosts) { const el = walkerEls.get(`ghost:${room.race.ghosts.indexOf(ghost)}`); if (el) el.style.left = pct(ghostDistanceAt(ghost, elapsed)); }
  const ghostLead = Math.max(0, ...room.race.ghosts.map((g) => ghostDistanceAt(g, elapsed)));
  if (ghostLead - room.race.distance >= ELIM_LAG_METERS) { room.race.eliminated = true; endRace(); }
}
function sendStep(foot) {
  if (!room.race || room.race.finished || room.race.eliminated || Date.now() < room.race.startedAt || foot === room.lastFoot) return;
  room.lastFoot = foot; room.race.distance = Math.min(TRACK_METERS, room.race.distance + STEP_GAIN_MIN + Math.random() * (STEP_GAIN_MAX - STEP_GAIN_MIN));
  room.race.samples.push([Date.now() - room.race.startedAt, room.race.distance]);
  const el = walkerEls.get("you"); if (el) { el.style.left = pct(room.race.distance); el.classList.add("stepping"); }
  if (room.race.distance >= TRACK_METERS) { room.race.finished = true; endRace(); }
}
function stopRace() { clearInterval(raceTimer); clearInterval(countdownTimer); raceTimer = countdownTimer = null; room.race = null; }
function endRace() {
  if (!room.race) return;
  clearInterval(raceTimer); raceTimer = null;
  const race = room.race; const finishMs = race.finished ? Date.now() - race.startedAt : null;
  if (finishMs) {
    const ghost = { seat: `local:${Date.now()}`, displayName: localStorage.getItem(LS_ME) || "you", handle: room.handle, finishMs, samples: race.samples, recordedAt: Date.now() };
    room.ghosts = [ghost, ...room.ghosts].sort((a, b) => a.finishMs - b.finishMs).slice(0, MAX_GHOSTS); saveList("runs", room.ghosts);
    room.history = [{ at: Date.now(), winner: ghost.displayName, winnerMs: finishMs, racers: 1 + race.ghosts.length }, ...room.history].slice(0, MAX_HISTORY); saveList("history", room.history);
    room.bestMs = room.ghosts[0]?.finishMs || finishMs; room.bestBy = room.ghosts[0]?.displayName || ghost.displayName;
  } else {
    room.history = [{ at: Date.now(), winner: "nobody", winnerMs: null, racers: 1 + race.ghosts.length }, ...room.history].slice(0, MAX_HISTORY); saveList("history", room.history);
  }
  const result = race.finished ? `🏁 you finished in ${(finishMs / 1000).toFixed(2)}s!` : "💨 picked off by a faster ghost — try again";
  els.raceStatusLine.textContent = result; els.resultsPanel.hidden = false; els.resultsList.innerHTML = "";
  const li = document.createElement("li"); li.textContent = result; els.resultsList.appendChild(li);
  room.race = null; renderRecord(); renderHistory(); renderGhostNote(); setTimeout(renderLobby, 2200);
}

function updateMeLabel(name) { els.meName.textContent = name || "a passerby"; }
els.startRaceBtn.addEventListener("click", startRace);
els.footLeft.addEventListener("click", () => sendStep("L")); els.footRight.addEventListener("click", () => sendStep("R"));
els.footLeft.addEventListener("touchstart", (e) => { e.preventDefault(); sendStep("L"); }, { passive: false });
els.footRight.addEventListener("touchstart", (e) => { e.preventDefault(); sendStep("R"); }, { passive: false });
window.addEventListener("keydown", (e) => { if (e.repeat || /INPUT|TEXTAREA/.test(e.target?.tagName)) return; if (["arrowleft", "a"].includes(e.key.toLowerCase())) sendStep("L"); else if (["arrowright", "d"].includes(e.key.toLowerCase())) sendStep("R"); });
els.meEdit.addEventListener("click", () => { const next = window.prompt("your bluesky handle (leave blank to walk anonymous):", localStorage.getItem(LS_ME) || ""); if (next === null) return; const value = cleanHandle(next); if (value) localStorage.setItem(LS_ME, value); else localStorage.removeItem(LS_ME); updateMeLabel(value || "a passerby"); });
els.shareBtn.addEventListener("click", () => { const url = `${location.origin}/w/${encodeURIComponent(room.handle)}`; window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(`race your local ghosts on bigwalk: ${url}`)}`, "_blank", "noopener"); });
els.copyBtn.addEventListener("click", async () => { const url = `${location.origin}/w/${encodeURIComponent(room.handle)}`; try { await navigator.clipboard.writeText(url); els.copyBtn.textContent = "copied!"; } catch { window.prompt("copy this link:", url); } setTimeout(() => { els.copyBtn.textContent = "copy link"; }, 1600); });

const savedMe = localStorage.getItem(LS_ME); if (savedMe) els.handleInput.value = savedMe;
route();

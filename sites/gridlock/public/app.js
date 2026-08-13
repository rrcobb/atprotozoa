// gridlock is a static, browser-local jam. The public AppView supplies the
// roster; notes, honks, mileage, and the checklist belong to this browser.
import { moots, resolveDid, getProfiles } from "./lib/cluster.js";

const LS_ME = "gridlock:me";
const MAX_NOTES = 300;
const CREEP_INTERVAL = 60000;
const BOARD_ITEMS = ["someone singing along, badly", "brake lights ripple off into the distance", "a trucker gives the horn-pull signal back", "a dog with its head out the window", "someone lane-changes and gains nothing", "an ambulance threads through, everyone freezes", "the light turns green and nobody moves for 3 full seconds", "bumper sticker philosophy", "someone visibly mid-argument on a call", "a motorcycle splits the lane", "someone eating something they really shouldn't be", "a car with one working headlight"];
const CREEP_LINES = ["the line inches forward", "everyone rolls up a few feet and stops again", "brake lights blink off, then right back on", "a gap opens up ahead — gone again in a second", "the whole jam exhales and creeps forward"];
const SURGE_LINES = ["the light finally lets a few cars through", "someone up front actually gets somewhere", "the jam breaks loose for a second — real progress", "a lane opens up and everyone surges forward"];
const els = Object.fromEntries(["landing jam startForm handleInput landingStatus jamOwnerName jamKind jamStatus meName meEdit shareBtn copyBtn cars road honkBtn honkTally mileage creepLine notesFeed noteForm noteInput boardList boardClears flyLayer"].map((key) => [key, document.getElementById(key)]));
const room = { handle: "", owner: null, pool: [], kind: "moots", board: [], spotted: {}, clears: 0, honks: 0, lastHonkBy: "", mileageFt: 0, lastCreepLine: "", notes: [], me: null };
let creepTimer = null;

function cleanHandle(raw) { return (raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "").split(/[\/\s]/)[0].toLowerCase(); }
function setStatus(el, text, error = false) { el.textContent = text || ""; el.classList.toggle("error", error); }
function feetLabel(ft) { return ft < 5280 ? `${ft} ft` : `${(ft / 5280).toFixed(2)} mi`; }
function key(kind) { return `gridlock:${room.handle}:${kind}`; }
function read(kind, fallback) { try { return JSON.parse(localStorage.getItem(key(kind)) || JSON.stringify(fallback)); } catch { return fallback; } }
function save(kind, value) { localStorage.setItem(key(kind), JSON.stringify(value)); }
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function colorFor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return ["#ff7a3d", "#4dd6c0", "#f2c94c", "#bb86fc", "#6fcf97", "#56ccf2", "#eb5757", "#f2994a"][h % 8]; }

function route() { els.landing.hidden = false; els.jam.hidden = true; }
els.startForm.addEventListener("submit", (event) => { event.preventDefault(); const handle = cleanHandle(els.handleInput.value); if (handle) { localStorage.setItem(LS_ME, handle); startJam(handle); } });

async function startJam(handle) {
  clearInterval(creepTimer); room.handle = cleanHandle(handle); els.landing.hidden = true; els.jam.hidden = false;
  els.jamOwnerName.textContent = room.handle; els.cars.innerHTML = ""; els.notesFeed.innerHTML = ""; els.boardList.innerHTML = "";
  setStatus(els.jamStatus, `resolving @${room.handle}…`);
  try {
    const result = await moots(room.handle, { onStep: (step) => setStatus(els.jamStatus, step) });
    room.owner = result.self; room.pool = result.pool || []; room.kind = result.kind || "moots";
    const saved = read("state", null);
    room.board = saved?.board || BOARD_ITEMS.slice(); room.spotted = saved?.spotted || {}; room.clears = saved?.clears || 0;
    room.honks = saved?.honks || 0; room.lastHonkBy = saved?.lastHonkBy || ""; room.mileageFt = saved?.mileageFt || 0;
    room.lastCreepLine = saved?.lastCreepLine || ""; room.notes = Array.isArray(saved?.notes) ? saved.notes : [];
    els.jamOwnerName.textContent = room.owner.displayName || room.owner.handle;
    els.jamKind.textContent = room.pool.length ? `${room.pool.length} ${room.kind === "moots" ? "moots" : "riders"} in the jam` : "riding solo (for now)";
    room.me = await resolveMe(); updateMeLabel(room.me.displayName); setStatus(els.jamStatus, "");
    renderCars(); renderBoard(); renderHonkTally(); renderMileage(); renderNotes(); if (room.lastCreepLine) setStatus(els.creepLine, room.lastCreepLine); scheduleCreep();
  } catch (error) { setStatus(els.jamStatus, `couldn't find @${room.handle} — ${error.message || "check the handle"}`, true); }
}
function persist() { save("state", { board: room.board, spotted: room.spotted, clears: room.clears, honks: room.honks, lastHonkBy: room.lastHonkBy, mileageFt: room.mileageFt, lastCreepLine: room.lastCreepLine, notes: room.notes }); }
function scheduleCreep() { clearInterval(creepTimer); creepTimer = setInterval(() => { const surge = Math.random() < .2; room.mileageFt += surge ? 40 + Math.floor(Math.random() * 50) : 3 + Math.floor(Math.random() * 11); room.lastCreepLine = pick(surge ? SURGE_LINES : CREEP_LINES); persist(); renderMileage(); setStatus(els.creepLine, room.lastCreepLine); creepEffect(surge); }, CREEP_INTERVAL); }

function presenceFor(seat) { return room.me && room.me.seat === seat ? [room.me] : []; }
function makeCar(seat, rider, color) {
  const car = document.createElement("div"); car.className = "car"; car.dataset.seat = seat; car.style.background = color || "#c9c1d8";
  const present = presenceFor(seat); if (present.length) car.classList.add("awake", "is-you"); else { const zzz = document.createElement("div"); zzz.className = "zzz"; zzz.textContent = "💤"; car.appendChild(zzz); }
  if (present.length) { const flag = document.createElement("div"); flag.className = "you-flag"; flag.textContent = "YOU"; car.appendChild(flag); }
  const win = document.createElement("div"); win.className = "window"; if (rider.avatar) { const img = document.createElement("img"); img.src = rider.avatar; img.alt = ""; img.loading = "lazy"; win.appendChild(img); } else win.textContent = "🙂"; car.appendChild(win);
  const plate = document.createElement("div"); plate.className = "plate"; plate.textContent = `@${rider.handle || rider.displayName || "guest"}`; car.appendChild(plate); return car;
}
function renderCars() { els.cars.innerHTML = ""; if (room.owner) els.cars.appendChild(makeCar("owner", room.owner, "#ffd27a")); room.pool.forEach((rider) => els.cars.appendChild(makeCar(rider.did, rider, "#c9c1d8"))); if (room.me && !["owner", ...room.pool.map((r) => r.did)].includes(room.me.seat)) els.cars.appendChild(makeCar(room.me.seat, room.me, room.me.color)); }
function renderHonkTally() { els.honkTally.textContent = room.honks ? `${room.honks} honk${room.honks === 1 ? "" : "s"} so far${room.lastHonkBy ? ` — last from ${room.lastHonkBy}` : ""}` : "no one's honked yet"; }
function renderMileage() { els.mileage.textContent = room.mileageFt ? `crawled ${feetLabel(room.mileageFt)} together` : "hasn't moved an inch yet"; }
function creepEffect(surge) { els.road.classList.remove("creeping", "surging"); void els.road.offsetWidth; els.road.classList.add(surge ? "surging" : "creeping"); }
function timeAgo(ts) { const s = Math.max(0, Math.floor((Date.now() - ts) / 1000)); return s < 5 ? "now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`; }
function renderNotes() { els.notesFeed.innerHTML = ""; if (!room.notes.length) { const empty = document.createElement("div"); empty.className = "note-empty"; empty.textContent = "it's quiet on the CB. say something."; els.notesFeed.appendChild(empty); } room.notes.forEach((note) => { const line = document.createElement("div"); line.className = "note-line"; const who = document.createElement("span"); who.className = "who"; who.textContent = note.displayName; line.append(who, `: ${note.text}`); const when = document.createElement("span"); when.className = "when"; when.textContent = timeAgo(note.at); line.appendChild(when); els.notesFeed.appendChild(line); }); els.notesFeed.scrollTop = els.notesFeed.scrollHeight; }

function renderBoard() { els.boardList.innerHTML = ""; room.board.forEach((label, i) => { const li = document.createElement("li"); const btn = document.createElement("button"); btn.type = "button"; btn.className = "board-item"; btn.textContent = label; const spot = room.spotted[i]; if (spot) { btn.classList.add("spotted"); btn.disabled = true; const by = document.createElement("span"); by.className = "by"; by.textContent = `spotted by ${spot.by}`; btn.appendChild(by); } else btn.addEventListener("click", () => spotItem(i)); li.appendChild(btn); els.boardList.appendChild(li); }); els.boardClears.textContent = room.clears ? `the jam has broken up ${room.clears} time${room.clears === 1 ? "" : "s"} 🎉` : ""; }
function spotItem(i) { const me = room.me?.displayName || "a passerby"; room.spotted[i] = { by: me, at: Date.now() }; if (Object.keys(room.spotted).length >= room.board.length) { room.clears++; room.spotted = {}; celebrateClear(); } persist(); renderBoard(); }
function celebrateClear() { const banner = document.createElement("div"); banner.className = "jam-cleared-banner"; banner.textContent = "🎉 board cleared — the jam breaks up! fresh round incoming…"; document.body.appendChild(banner); setTimeout(() => banner.remove(), 3200); }

let audioCtx = null;
function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = "square"; osc.frequency.value = 220; gain.gain.value = .05; osc.connect(gain).connect(audioCtx.destination); osc.start(); gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + .35); osc.stop(audioCtx.currentTime + .35); } catch {} }
els.honkBtn.addEventListener("click", () => { room.honks++; room.lastHonkBy = room.me?.displayName || "a passerby"; persist(); renderHonkTally(); beep(); const seat = room.me?.seat; const car = seat && els.cars.querySelector(`[data-seat="${CSS.escape(seat)}"]`); if (car) { car.classList.add("honking"); setTimeout(() => car.classList.remove("honking"), 500); } });
els.noteForm.addEventListener("submit", (event) => { event.preventDefault(); const text = els.noteInput.value.trim(); if (!text) return; const me = room.me || { displayName: "a passerby", seat: "passerby" }; room.notes.push({ id: crypto.randomUUID(), displayName: me.displayName, seat: me.seat, text: text.slice(0, 180), at: Date.now() }); room.notes = room.notes.slice(-MAX_NOTES); persist(); renderNotes(); els.noteInput.value = ""; });

async function resolveMe() { const stored = localStorage.getItem(LS_ME); if (!stored) return { displayName: "a passerby", handle: "", seat: `passerby:${crypto.randomUUID()}`, color: colorFor("guest") }; if (room.owner?.handle.toLowerCase() === stored) return { ...room.owner, seat: "owner", color: "#ffd27a" }; const pool = room.pool.find((r) => r.handle.toLowerCase() === stored); if (pool) return { ...pool, seat: pool.did, color: "#c9c1d8" }; try { const did = await resolveDid(stored); const p = (await getProfiles([did]))[0]; return { did, handle: p?.handle || stored, displayName: p?.displayName || p?.handle || stored, avatar: p?.avatar || "", seat: `passerby:${did}`, color: colorFor(did) }; } catch { return { displayName: stored, handle: stored, seat: `passerby:${stored}`, color: colorFor(stored) }; } }
function updateMeLabel(name) { els.meName.textContent = name || "a passerby"; }
els.meEdit.addEventListener("click", async () => { const next = prompt("your bluesky handle (leave blank to ride anonymous):", localStorage.getItem(LS_ME) || ""); if (next === null) return; const value = cleanHandle(next); value ? localStorage.setItem(LS_ME, value) : localStorage.removeItem(LS_ME); room.me = await resolveMe(); updateMeLabel(room.me.displayName); renderCars(); });
els.shareBtn.addEventListener("click", () => { const url = location.origin + "/"; window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(`sit in a local gridlock jam with me: ${url}`)}`, "_blank", "noopener"); });
els.copyBtn.addEventListener("click", async () => { const url = location.origin + "/"; try { await navigator.clipboard.writeText(url); els.copyBtn.textContent = "copied!"; } catch { prompt("copy this link:", url); } setTimeout(() => { els.copyBtn.textContent = "copy link"; }, 1600); });
const savedMe = localStorage.getItem(LS_ME); if (savedMe) els.handleInput.value = savedMe; route();

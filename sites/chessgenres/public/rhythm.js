import { LANES, SONGS, DIFFS, newSong, press, release, tick, finished, grade, accuracy, badge, multiplier, calibrate, parseMoves } from "./rhythm-logic.js";
import { replay, randomGame } from "./rhythm-chess.js";

const $ = (id) => document.getElementById(id);
const cv = $("rc"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height, LW = W / 4;
const HIT_Y = H - 90;
const KEY = "chessgenres:rhythm";
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(KEY + ":" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + ":" + k, JSON.stringify(v)); } catch { /* private mode: nothing to save to */ } },
};

let s = null, song = SONGS[3], t0 = 0, raf = 0, flash = [0, 0, 0, 0], popup = null, audio = null, shake = 0;
let parts = [], cal = null, custom = null, offset = Number(store.get("offset", 0)) || 0; // offset in ms: positive = you tap late
const down = new Set(), pointers = new Map();
const now = () => (performance.now() - t0) / 1000;
const fall = () => (s ? s.diff.fall : DIFFS[$("rDiff").value].fall);

function beep(freq, dur = 0.18, type = "triangle", vol = 0.08) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + dur + 0.02);
  } catch { /* no audio is fine */ }
}

// ---- the options panel, built here so index.html stays small ----
function buildOptions() {
  const box = document.createElement("div");
  box.id = "rOpts";
  box.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px";
  const sel = "background:#241e1a;color:var(--fg);border:1px solid #3a302a;border-radius:6px;padding:6px;font:inherit";
  box.innerHTML =
    `<select id="rSong" style="${sel}">${SONGS.map((x, i) => `<option value="${i}"${x === song ? " selected" : ""}>${"★".repeat(x.stars)} ${x.name}</option>`).join("")}<option value="free">freeplay (your game)</option></select>` +
    `<select id="rDiff" style="${sel}">${Object.values(DIFFS).map((d) => `<option value="${d.name}"${d.name === "normal" ? " selected" : ""}>${d.name}</option>`).join("")}</select>` +
    `<label class="dim">latency <input id="rOffset" type="number" min="-300" max="300" step="5" value="${offset}" style="width:64px;${sel}"> ms</label>` +
    `<button id="rCal" style="${sel};cursor:pointer">calibrate</button>` +
    `<p id="rInfo" class="dim" style="flex-basis:100%;margin:0"></p>` +
    `<div id="rFree" hidden style="flex-basis:100%"><textarea id="rPaste" rows="3" placeholder="paste moves, e.g. 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 (PGN tags and comments are fine)" style="width:100%;${sel}"></textarea>` +
    `<div class="ctl" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button id="rChart">chart this game</button><button id="rRandom">random legal game</button></div></div>`;
  const ctl = $("rStart").parentElement;
  ctl.parentElement.insertBefore(box, cv);
}
buildOptions();

function pickedSong() {
  const v = $("rSong").value;
  if (v === "free") return custom ? { id: "free", name: custom.name, moves: custom.moves, bpm: 116, stars: 0 } : null;
  return SONGS[Number(v)];
}

function info() {
  const v = $("rSong").value, d = DIFFS[$("rDiff").value];
  $("rFree").hidden = v !== "free";
  const sg = pickedSong();
  const best = sg && store.get("best", {})[sg.id + ":" + d.name];
  const rules = d.fail ? "run out of composure and you resign" : "no-fail: miss all you like";
  $("rInfo").textContent = (sg ? `${sg.by || sg.name} · ${sg.moves.length} moves` : "paste a game or roll a random one") +
    ` · ${rules}${best ? ` · best ${best.score} (${best.grade})` : ""}`;
}

function start() {
  const sg = pickedSong();
  if (!sg) { $("rLog").textContent = "freeplay needs a game: paste moves or pick a random legal game first."; return; }
  song = sg;
  s = newSong(sg.moves, { bpm: sg.bpm, diff: $("rDiff").value });
  t0 = performance.now(); popup = null; parts = []; shake = 0; down.clear(); pointers.clear();
  $("rShare").hidden = true; $("rLog").textContent = "";
  $("rStart").textContent = "restart";
  cancelAnimationFrame(raf);
  loop();
}

function burst(lane, kind) {
  const n = kind === "perfect" ? 14 : 7;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 2 + Math.random() * 4;
    parts.push({ x: (lane + 0.5) * LW, y: HIT_Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: LANES[lane].color });
  }
}
const JCOL = { perfect: "#fff6c8", great: "#6fd48a", good: "#5aa9e6", miss: "#d8584a", drop: "#d8584a", hold: "#e8b04a" };

function hit(lane) {
  if (cal) return calTap();
  if (!s) return;
  const t = now() - offset / 1000;
  flash[lane] = 1; down.add(lane);
  const kind = press(s, lane, t);
  if (kind) {
    const dt = s.lastDt, tag = kind === "perfect" ? "" : dt > 0.02 ? " early" : dt < -0.02 ? " late" : "";
    popup = { text: kind + tag, c: JCOL[kind], at: performance.now() };
    beep(330 + lane * 110 + (s.lastNote.san.endsWith("#") ? 220 : 0)); burst(lane, kind);
  } else beep(110, 0.1); // a press that hits nothing costs nothing but sounds sour
  ui();
}
function letGo(lane) {
  down.delete(lane);
  if (!s) return;
  const r = release(s, lane, now() - offset / 1000);
  if (r === "drop") { popup = { text: "dropped!", c: JCOL.drop, at: performance.now() }; shake = 8; beep(90, 0.15, "sawtooth"); }
  if (r === "hold") { popup = { text: "held!", c: JCOL.hold, at: performance.now() }; burst(lane, "perfect"); }
}

function draw(t) {
  const sh = shake > 0.5 ? (Math.random() - 0.5) * shake : 0; shake *= 0.88;
  ctx.save(); ctx.translate(sh, 0);
  ctx.fillStyle = "#14100d"; ctx.fillRect(-10, 0, W + 20, H);
  for (let l = 0; l < 4; l++) {
    ctx.fillStyle = (l % 2 ? "#1b1612" : "#201a15"); ctx.fillRect(l * LW, 0, LW, H);
    if (flash[l] > 0 || down.has(l)) { ctx.fillStyle = LANES[l].color + (down.has(l) ? "33" : "44"); ctx.fillRect(l * LW, 0, LW, H); flash[l] = Math.max(0, flash[l] - 0.08); }
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let l = 0; l < 4; l++) {
    ctx.strokeStyle = LANES[l].color; ctx.lineWidth = down.has(l) ? 5 : 3;
    ctx.strokeRect(l * LW + 14, HIT_Y - 34, LW - 28, 68);
    ctx.fillStyle = LANES[l].color + "99"; ctx.font = `${LW * 0.3}px serif`;
    ctx.fillText(LANES[l].glyph, (l + 0.5) * LW, HIT_Y - 4);
    ctx.font = "bold 14px system-ui"; ctx.fillText(LANES[l].key.toUpperCase(), (l + 0.5) * LW, HIT_Y + 24);
  }
  if (cal) {
    const pulse = Math.max(0, 1 - (performance.now() - cal.lastClick) / 250);
    ctx.fillStyle = `rgba(232,176,74,${0.2 + pulse * 0.6})`; ctx.beginPath(); ctx.arc(W / 2, H / 2, 40 + pulse * 30, 0, 7); ctx.fill();
    ctx.fillStyle = "#f1e9dc"; ctx.font = "bold 20px system-ui";
    ctx.fillText(`tap any lane on each click (${cal.taps.length}/${cal.n})`, W / 2, H / 2 + 110);
    ctx.restore(); return;
  }
  if (!s) { ctx.fillStyle = "#c9b79c"; ctx.font = "bold 22px system-ui"; ctx.fillText("press start", W / 2, H / 2); ctx.restore(); return; }
  const F = fall(), span = HIT_Y + 40, yOf = (tt) => HIT_Y - ((tt - t) / F) * span;
  for (const n of s.notes) {
    if (n.state !== "wait" && n.state !== "miss" && n.state !== "holding" && n.state !== "drop") continue;
    const y = n.state === "holding" ? HIT_Y : yOf(n.t);
    const yTail = n.len ? yOf(n.t + n.len) : y;
    if (y < -40 && yTail < -40 || y > H + 40) continue;
    ctx.globalAlpha = n.state === "miss" || n.state === "drop" ? 0.3 : 1;
    const x = n.lane * LW + 18, w = LW - 36;
    if (n.len) { ctx.fillStyle = LANES[n.lane].color + (n.state === "holding" ? "cc" : "66"); ctx.fillRect(x + w * 0.25, yTail, w * 0.5, y - yTail); }
    ctx.fillStyle = LANES[n.lane].color;
    if (n.state === "holding") { ctx.shadowColor = LANES[n.lane].color; ctx.shadowBlur = 18; }
    ctx.beginPath(); ctx.roundRect(x, y - 28, w, 56, 10); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#1a1209"; ctx.font = "bold 17px system-ui";
    ctx.fillText(n.san.endsWith("#") ? "♚#" : n.san, (n.lane + 0.5) * LW, y);
    ctx.globalAlpha = 1;
  }
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.03; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 4, 4); }
  ctx.globalAlpha = 1; parts = parts.filter((p) => p.life > 0);
  // progress strip and composure
  ctx.fillStyle = "#2a2230"; ctx.fillRect(0, 0, W, 6); ctx.fillStyle = "#c9b79c"; ctx.fillRect(0, 0, W * Math.min(1, Math.max(0, t / s.end)), 6);
  if (s.diff.fail) {
    ctx.fillStyle = "#2a2230"; ctx.fillRect(0, 8, W, 6);
    ctx.fillStyle = s.hp > 35 ? "#6fd48a" : "#d8584a"; ctx.fillRect(0, 8, W * (s.hp / 100), 6);
  }
  if (popup && performance.now() - popup.at < 600) { ctx.fillStyle = popup.c; ctx.font = "bold 26px system-ui"; ctx.fillText(popup.text.toUpperCase(), W / 2, 56); }
  if (s.combo > 1) { ctx.fillStyle = "#e8b04a"; ctx.font = "bold 18px system-ui"; ctx.fillText(`${s.combo} combo · x${multiplier(s.combo)}`, W / 2, 88); }
  ctx.restore();
}

function ui() {
  if (!s) return;
  $("rScore").textContent = s.score;
  $("rCombo").textContent = s.combo;
  $("rBest").textContent = s.best;
}

function loop() {
  const t = now();
  const before = s.combo, miss = s.counts.miss;
  tick(s, t);
  if (s.counts.miss > miss) { shake = 8; popup = { text: "miss", c: JCOL.miss, at: performance.now() }; }
  if (s.combo > before && s.combo % 10 === 0) popup = { text: `x${multiplier(s.combo)} multiplier!`, c: "#e8b04a", at: performance.now() };
  draw(t);
  ui();
  if (finished(s, t)) return end();
  raf = requestAnimationFrame(loop);
}

function end() {
  draw(now());
  const g = grade(s), pct = Math.round(accuracy(s) * 100), bd = badge(s), d = s.diffId;
  const bests = store.get("best", {}), k = song.id + ":" + d, prev = bests[k];
  const record = !s.failed && (!prev || s.score > prev.score);
  if (record && song.id !== "free") { bests[k] = { score: s.score, grade: g }; store.set("best", bests); }
  $("rLog").textContent = (s.failed ? `you ran out of composure and resigned at ${Math.round((now() / s.end) * 100)}% of ${song.name}.\n`
    : `${song.moves[song.moves.length - 1].endsWith("#") ? "checkmate!" : "game over."} `) +
    `grade ${s.failed ? "F" : g}${bd && !s.failed ? " · " + bd : ""} · ${pct}% accuracy · score ${s.score}${record && song.id !== "free" ? " (new best!)" : ""} · best combo ${s.best}\n` +
    `perfect ${s.counts.perfect} · great ${s.counts.great} · good ${s.counts.good} · miss ${s.counts.miss} · holds ${s.holds}/${s.drops + s.holds}`;
  const txt = s.failed ? `I resigned halfway through ${song.name} on ${d} in Chess Chess Revolution.`
    : `I got a ${g}${bd ? " (" + bd + ")" : ""}: ${s.score} pts, ${s.best} combo on ${d}, dancing ${song.name} in Chess Chess Revolution.`;
  $("rShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#rhythm");
  $("rShare").hidden = false;
  s = null; // song over; the next press of start builds a fresh one
  info();
}

// ---- calibration: tap along with eight clicks, the median lag becomes the offset ----
function calTap() {
  cal.taps.push(performance.now());
  beep(660, 0.05, "square", 0.03);
}
function startCal() {
  if (cal) return;
  cancelAnimationFrame(raf); s = null;
  cal = { n: 8, clicks: [], taps: [], lastClick: 0 };
  $("rLog").textContent = "calibrating: tap any lane (or the board) exactly on each click.";
  let i = 0;
  const tickClick = () => {
    if (!cal) return;
    if (i >= cal.n) { setTimeout(finishCal, 500); return; }
    cal.clicks.push(performance.now()); cal.lastClick = performance.now(); beep(880, 0.06, "square", 0.06); i++;
    setTimeout(tickClick, 600);
  };
  setTimeout(tickClick, 900);
  const anim = () => { if (!cal) return; draw(0); requestAnimationFrame(anim); };
  anim();
}
function finishCal() {
  const r = calibrate(cal.clicks.map((x) => x / 1000), cal.taps.map((x) => x / 1000));
  cal = null;
  if (r === null) $("rLog").textContent = "not enough taps heard; try again and tap on each click.";
  else { offset = Math.round(r * 1000); $("rOffset").value = offset; store.set("offset", offset); $("rLog").textContent = `latency set to ${offset} ms.`; }
  draw(0);
}

// ---- freeplay ----
function chartFrom(moves, name) {
  const r = replay(moves.slice(0, 160)); // 160 plies keeps a pasted epic to a few minutes
  if (r.moves.length < 2) { $("rLog").textContent = r.bad >= 0 ? `"${moves[r.bad]}" isn't a legal first move.` : "need at least two moves."; return; }
  custom = { name, moves: r.moves };
  $("rLog").textContent = r.bad >= 0 ? `charted ${r.moves.length} moves; "${moves[r.bad]}" (move ${r.bad + 1}) isn't legal, so the song stops before it.` : `charted ${r.moves.length} legal moves. press start.`;
  info();
}

const keymap = Object.fromEntries(LANES.map((l, i) => [l.key, i]));
Object.assign(keymap, { arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 });
window.addEventListener("keydown", (e) => {
  if ($("rhythm").hidden || e.repeat || /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
  const lane = keymap[e.key.toLowerCase()];
  if (lane === undefined) return;
  e.preventDefault(); hit(lane);
});
window.addEventListener("keyup", (e) => { const lane = keymap[e.key.toLowerCase()]; if (lane !== undefined) letGo(lane); });
window.addEventListener("blur", () => { for (const l of [...down]) letGo(l); });
const laneAt = (e) => { const r = cv.getBoundingClientRect(); return Math.min(3, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 4))); };
cv.style.touchAction = "none"; // multi-finger chords shouldn't scroll or zoom the page
cv.addEventListener("pointerdown", (e) => { const l = laneAt(e); pointers.set(e.pointerId, l); hit(l); });
const up = (e) => { const l = pointers.get(e.pointerId); pointers.delete(e.pointerId); if (l !== undefined) letGo(l); };
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);

$("rStart").addEventListener("click", () => { $("rLog").textContent = ""; start(); });
$("rSong").addEventListener("change", info);
$("rDiff").addEventListener("change", info);
$("rCal").addEventListener("click", startCal);
$("rOffset").addEventListener("change", () => { offset = Math.max(-300, Math.min(300, Number($("rOffset").value) || 0)); $("rOffset").value = offset; store.set("offset", offset); });
$("rChart").addEventListener("click", () => {
  const m = parseMoves($("rPaste").value);
  if (!m.length) { $("rLog").textContent = "nothing to chart: paste some moves first."; return; }
  chartFrom(m, "your game");
});
$("rRandom").addEventListener("click", () => { const g = randomGame(Math.random, 60); $("rPaste").value = g.map((m, i) => (i % 2 ? "" : i / 2 + 1 + ". ") + m).join(" "); chartFrom(g, "a random game"); });
info();
draw(0);

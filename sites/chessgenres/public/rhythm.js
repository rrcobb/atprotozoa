import { LANES, newSong, press, tick, finished, grade, accuracy, judge } from "./rhythm-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("rc"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height, LW = W / 4;
const FALL = 1.6, HIT_Y = H - 90; // seconds a note takes to fall to the hit line
let s = null, t0 = 0, raf = 0, flash = [0, 0, 0, 0], popup = "", audio = null;

const now = () => (performance.now() - t0) / 1000;

function beep(freq) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "triangle"; o.frequency.value = freq; g.gain.value = 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.2);
  } catch { /* no audio is fine */ }
}

function start() {
  s = newSong();
  t0 = performance.now(); popup = "";
  $("rShare").hidden = true;
  $("rStart").textContent = "restart";
  cancelAnimationFrame(raf);
  loop();
}

function hit(lane) {
  if (!s) return;
  const t = now();
  flash[lane] = 1;
  const kind = press(s, lane, t);
  if (kind) { popup = kind; beep(330 + lane * 110); } else beep(110);
  ui();
}

function draw(t) {
  ctx.fillStyle = "#14100d"; ctx.fillRect(0, 0, W, H);
  for (let l = 0; l < 4; l++) {
    ctx.fillStyle = (l % 2 ? "#1b1612" : "#201a15"); ctx.fillRect(l * LW, 0, LW, H);
    if (flash[l] > 0) { ctx.fillStyle = LANES[l].color + "44"; ctx.fillRect(l * LW, 0, LW, H); flash[l] = Math.max(0, flash[l] - 0.08); }
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // receptors
  for (let l = 0; l < 4; l++) {
    ctx.strokeStyle = LANES[l].color; ctx.lineWidth = 3;
    ctx.strokeRect(l * LW + 14, HIT_Y - 34, LW - 28, 68);
    ctx.fillStyle = LANES[l].color + "99"; ctx.font = `${LW * 0.3}px serif`;
    ctx.fillText(LANES[l].glyph, (l + 0.5) * LW, HIT_Y - 4);
    ctx.font = "bold 14px system-ui"; ctx.fillText(LANES[l].key.toUpperCase(), (l + 0.5) * LW, HIT_Y + 24);
  }
  if (!s) { ctx.fillStyle = "#c9b79c"; ctx.font = "bold 22px system-ui"; ctx.fillText("press start", W / 2, H / 2); return; }
  for (const n of s.notes) {
    if (n.state !== "wait" && n.state !== "miss") continue;
    const y = HIT_Y - ((n.t - t) / FALL) * (HIT_Y + 40);
    if (y < -40 || y > H + 40) continue;
    ctx.globalAlpha = n.state === "miss" ? 0.3 : 1;
    ctx.fillStyle = LANES[n.lane].color;
    ctx.beginPath(); ctx.roundRect(n.lane * LW + 18, y - 28, LW - 36, 56, 10); ctx.fill();
    ctx.fillStyle = "#1a1209"; ctx.font = "bold 18px system-ui";
    ctx.fillText(n.san, (n.lane + 0.5) * LW, y);
    ctx.globalAlpha = 1;
  }
  if (popup) { ctx.fillStyle = "#fff"; ctx.font = "bold 26px system-ui"; ctx.fillText(popup.toUpperCase(), W / 2, 60); }
  if (s.combo > 1) { ctx.fillStyle = "#e8b04a"; ctx.font = "bold 18px system-ui"; ctx.fillText(s.combo + " combo", W / 2, 92); }
}

function ui() {
  if (!s) return;
  $("rScore").textContent = s.score;
  $("rCombo").textContent = s.combo;
  $("rBest").textContent = s.best;
}

function loop() {
  const t = now();
  tick(s, t);
  draw(t);
  ui();
  if (finished(s, t)) return end();
  raf = requestAnimationFrame(loop);
}

function end() {
  draw(now());
  const g = grade(s), pct = Math.round(accuracy(s) * 100);
  $("rLog").textContent = `checkmate! grade ${g} · ${pct}% accuracy · score ${s.score} · best combo ${s.best}\n` +
    `perfect ${s.counts.perfect} · great ${s.counts.great} · good ${s.counts.good} · miss ${s.counts.miss}`;
  const txt = `I got a ${g} (${s.score} pts, ${s.best} combo) on Chess Chess Revolution, dancing Morphy's Opera Game.`;
  $("rShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#rhythm");
  $("rShare").hidden = false;
  s = null; // song over; the next press of start builds a fresh one
}

const keymap = Object.fromEntries(LANES.map((l, i) => [l.key, i]));
Object.assign(keymap, { arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 });
window.addEventListener("keydown", (e) => {
  if ($("rhythm").hidden || e.repeat) return;
  const lane = keymap[e.key.toLowerCase()];
  if (lane === undefined) return;
  e.preventDefault(); hit(lane);
});
cv.addEventListener("pointerdown", (e) => {
  const r = cv.getBoundingClientRect();
  hit(Math.min(3, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 4))));
});
$("rStart").addEventListener("click", () => { $("rLog").textContent = ""; start(); });
draw(0);

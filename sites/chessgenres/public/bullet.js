import { W, H, KINDS, DIFFS, STAGES, MAX_POWER, newGame, step, bomb, result, bossPhase, isRecord } from "./bullet-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("uc"), ctx = cv.getContext("2d");
const KEY = "chessgenres:bullet";
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(KEY + ":" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + ":" + k, JSON.stringify(v)); } catch { /* private mode: nothing to save to */ } },
};
let s = null, raf = 0, last = 0, target = null, paused = false, flash = 0, flashC = "#fff", focusToggle = false, muted = store.get("muted", false), audio = null, lastGraze = 0;
const keys = new Set();
const CARD_COLORS = ["#e8b04a", "#e0607e", "#b57bff", "#5aa9e6"];

function tone(f, dur = 0.1, type = "square", vol = 0.03) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + dur + 0.02);
  } catch { /* no audio is fine */ }
}

// ---- extra HUD and options, built here so index.html stays small ----
(function build() {
  const hud = $("uLives").closest(".hud");
  const mk = (label, id) => { const sp = document.createElement("span"); sp.innerHTML = `${label} <b id="${id}">-</b>`; hud.appendChild(sp); };
  mk("stage", "uStageNo"); mk("power", "uPower"); mk("chain", "uMult"); mk("best", "uHi");
  const sel = "background:#241e1a;color:var(--fg);border:1px solid #3a302a;border-radius:6px;padding:6px;font:inherit";
  const box = document.createElement("div");
  box.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px";
  box.innerHTML = `<select id="uDiff" style="${sel}">${Object.values(DIFFS).map((d) => `<option value="${d.name}"${d.name === "normal" ? " selected" : ""}>${d.name}</option>`).join("")}</select>` +
    `<select id="uStage" style="${sel}"></select>` +
    `<label class="dim"><input type="checkbox" id="uSound" ${muted ? "" : "checked"}> sound</label>`;
  cv.parentElement.insertBefore(box, cv);
  const ctl = $("uStart").parentElement;
  const f = document.createElement("button"); f.id = "uFocus"; f.textContent = "focus: off"; ctl.appendChild(f);
  const p = document.createElement("button"); p.id = "uPause"; p.textContent = "pause"; ctl.appendChild(p);
})();

function fillStages() {
  const max = store.get("maxStage", 0);
  $("uStage").innerHTML = STAGES.map((st, i) => `<option value="${i}"${i > max ? " disabled" : ""}>${i === 0 ? "full run: " : "practice: "}stage ${i + 1}${i > max ? " (locked)" : ""} ${st.name}</option>`).join("");
}
function hiKey() { return $("uDiff").value; }
function showHi() { $("uHi").textContent = store.get("hi", {})[hiKey()] || 0; }
fillStages(); showHi();

function start() {
  s = newGame((Math.random() * 1e9) | 0, { diff: $("uDiff").value, stage: Number($("uStage").value) || 0 });
  target = null; last = performance.now(); paused = false; flash = 0;
  $("uShare").hidden = true; $("uLog").textContent = "";
  $("uStart").textContent = "restart"; $("uPause").textContent = "pause";
  s.banner = { text: `stage ${s.stage + 1}: ${STAGES[s.stage].name}`, t: 2.5, kind: "stage" };
  cancelAnimationFrame(raf);
  loop(last);
}

function input() {
  const k = (n) => keys.has(n);
  const i = {
    mx: (k("arrowright") || k("d") ? 1 : 0) - (k("arrowleft") || k("a") ? 1 : 0),
    my: (k("arrowdown") || k("s") ? 1 : 0) - (k("arrowup") || k("w") ? 1 : 0),
    focus: k("shift") || focusToggle,
  };
  if (target && !i.mx && !i.my) { i.tx = target.x; i.ty = target.y; }
  return i;
}

function sounds() {
  for (const f of s.fx) {
    if (f.type === "graze") { if (performance.now() - lastGraze > 60) { tone(1400, 0.03, "square", 0.015); lastGraze = performance.now(); } }
    else if (f.type === "hurt") { tone(120, 0.4, "sawtooth", 0.07); flash = 0.6; flashC = "#d8584a"; }
    else if (f.type === "bomb") { tone(200, 0.5, "triangle", 0.07); flash = 0.7; flashC = "#ffffff"; }
    else if (f.type === "pickup") tone(f.v === "gem" ? 1000 : 700, 0.08, "triangle", 0.04);
    else if (f.type === "kill") tone(300, 0.07, "triangle", 0.03);
    else if (f.type === "card") { tone(520, 0.2, "triangle", 0.05); tone(780, 0.3, "triangle", 0.04); }
    else if (f.type === "bonus" || f.type === "extend" || f.type === "bossdown") { tone(880, 0.25, "triangle", 0.06); flash = 0.4; flashC = "#e8b04a"; }
  }
  s.fx.length = 0;
}

function draw() {
  ctx.fillStyle = "#0d0a12"; ctx.fillRect(0, 0, W, H);
  // checkerboard backdrop, scrolling slowly so there is a sense of motion
  const sq = 60, off = ((s ? s.t : 0) * 30) % (sq * 2);
  ctx.fillStyle = "#15101c";
  for (let r = -2; r < H / sq + 2; r++) for (let c = 0; c < W / sq; c++) if ((r + c) % 2 === 0) ctx.fillRect(c * sq, r * sq + off, sq, sq);
  if (!s) { ctx.fillStyle = "#c9b79c"; ctx.font = "bold 22px system-ui"; ctx.textAlign = "center"; ctx.fillText("press start", W / 2, H / 2); return; }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // a boss telegraphing a column
  for (const e of s.enemies) {
    if (e.warn) { ctx.fillStyle = `rgba(255,93,122,${0.15 + 0.2 * Math.sin(s.t * 30)})`; ctx.fillRect(e.warn.x - 36, 0, 72, H); }
  }
  for (const it of s.items) {
    const c = it.type === "power" ? "#ff7a5c" : it.type === "bomb" ? "#7ad0ff" : it.type === "life" ? "#e0607e" : "#9be28a";
    ctx.fillStyle = c; ctx.font = "20px serif"; ctx.fillText(it.type === "power" ? "♟" : it.type === "bomb" ? "♖" : it.type === "life" ? "♥" : "◆", it.x, it.y);
  }
  let boss = null;
  for (const e of s.enemies) {
    ctx.font = `${e.r * 2.2}px serif`;
    ctx.fillStyle = e.boss ? CARD_COLORS[bossPhase(e) % 4] : e.kind === "queen" ? CARD_COLORS[0] : "#d9cdb8";
    if (e.boss) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16; boss = e; }
    ctx.fillText(KINDS[e.kind].glyph, e.x, e.y); ctx.shadowBlur = 0;
  }
  ctx.fillStyle = "#fff6c8";
  for (const b of s.shots) ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
  for (const b of s.bullets) {
    ctx.fillStyle = b.pause && b.age >= b.pause[0] && b.age < b.pause[1] ? "#ffb347" : "#ff5d7a"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, 7); ctx.fill();
  }
  const p = s.p;
  if (!(p.inv > 0 && Math.floor(s.t * 12) % 2)) {
    ctx.font = "34px serif"; ctx.fillStyle = p.dying > 0 ? "#ff5d7a" : "#f1e9dc"; ctx.fillText("♔", p.x, p.y);
  }
  ctx.fillStyle = "#4ad0ff"; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); // the hitbox
  if (input().focus) { ctx.strokeStyle = "#4ad0ff55"; ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, 7); ctx.stroke(); } // graze ring while focused
  if (boss) {
    const card = boss.def.cards[boss.ci], left = Math.max(0, Math.ceil(card.limit - boss.cardT));
    ctx.fillStyle = "#2a2230"; ctx.fillRect(40, 10, W - 80, 8);
    ctx.fillStyle = "#d8584a"; ctx.fillRect(40, 10, (W - 80) * Math.max(0, boss.hp / boss.max), 8);
    ctx.fillStyle = "#f1e9dc";
    for (const c of boss.def.cards.slice(0, -1)) ctx.fillRect(40 + (W - 80) * c.until - 1, 8, 2, 12); // where the next card begins
    ctx.font = "bold 13px system-ui"; ctx.textAlign = "left"; ctx.fillText(boss.def.name, 40, 30);
    ctx.textAlign = "right"; ctx.fillStyle = CARD_COLORS[bossPhase(boss) % 4]; ctx.fillText(`${card.name}  ${left}`, W - 40, 30);
    ctx.textAlign = "center";
  }
  if (s.banner) {
    const b = s.banner, a = Math.min(1, b.t);
    ctx.globalAlpha = a; ctx.font = "bold 26px system-ui";
    ctx.fillStyle = b.kind === "card" ? "#ffd9a0" : b.kind === "bonus" ? "#9be28a" : "#f1e9dc";
    ctx.fillText(b.text, W / 2, b.kind === "card" ? H * 0.32 : H * 0.42); ctx.globalAlpha = 1;
  }
  if (flash > 0) { ctx.globalAlpha = flash * 0.5; ctx.fillStyle = flashC; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; flash = Math.max(0, flash - 0.04); }
  if (paused) { ctx.fillStyle = "#000a"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#f1e9dc"; ctx.font = "bold 28px system-ui"; ctx.fillText("paused", W / 2, H / 2); }
}

function ui() {
  $("uScore").textContent = s.score;
  $("uLives").textContent = "♔".repeat(Math.max(0, s.lives)) || "—";
  $("uBombs").textContent = s.bombs;
  $("uGraze").textContent = s.grazes;
  $("uStageNo").textContent = `${s.stage + 1}/${STAGES.length}`;
  $("uPower").textContent = s.power >= MAX_POWER ? "max" : `${s.power}/${MAX_POWER}`;
  $("uMult").textContent = "x" + s.mult.toFixed(1);
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!$("bullet").hidden && !paused) { step(s, dt, input()); sounds(); } // frozen while another genre is showing
  draw(); ui();
  if (s.over) return end();
  raf = requestAnimationFrame(loop);
}

function end() {
  const r = result(s), hi = store.get("hi", {}), rec = isRecord(hi[r.diff], r);
  if (rec) { hi[r.diff] = r.total; store.set("hi", hi); }
  const unlocked = Math.min(STAGES.length - 1, s.won ? STAGES.length - 1 : s.stage);
  if (unlocked > store.get("maxStage", 0)) store.set("maxStage", unlocked);
  fillStages(); showHi();
  const boss = s.enemies.find((e) => e.boss);
  $("uLog").textContent = (r.won
    ? `checkmate! the giant queen falls. ${r.total} points · ${r.grazes} grazes · ${r.lives} lives left · ${r.diff}`
    : `captured. ${r.total} points · ${r.grazes} grazes · stage ${r.stage}${boss ? ` vs ${boss.def.name} (${boss.def.cards[boss.ci].name})` : ""} · ${r.diff}`) +
    (rec ? "\nnew high score!" : "");
  const txt = r.won ? `I beat the giant queen in Chess Bullet Hell on ${r.diff}: ${r.total} pts, ${r.grazes} grazes.`
    : `I was captured on stage ${r.stage} of Chess Bullet Hell on ${r.diff}: ${r.total} pts, ${r.grazes} grazes.`;
  $("uShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#bullet");
  $("uShare").hidden = false;
  draw();
}

const GAME_KEYS = ["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "shift"];
function togglePause() { if (!s || s.over) return; paused = !paused; $("uPause").textContent = paused ? "resume" : "pause"; last = performance.now(); draw(); }
window.addEventListener("keydown", (e) => {
  if ($("bullet").hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (GAME_KEYS.includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === "p") return togglePause();
  if ((k === " " || k === "x") && s && !paused) bomb(s);
  keys.add(k);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

function point(e) {
  const r = cv.getBoundingClientRect();
  // aim a little above the finger so the king stays visible
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H - 50 };
}
cv.style.touchAction = "none"; // dragging the king shouldn't scroll the page
cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); target = point(e); });
cv.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "touch") target = point(e); });
cv.addEventListener("pointerup", () => { target = null; });
cv.addEventListener("pointercancel", () => { target = null; });
$("uStart").addEventListener("click", start);
$("uBomb").addEventListener("click", () => { if (s && !paused) bomb(s); });
$("uFocus").addEventListener("click", () => { focusToggle = !focusToggle; $("uFocus").textContent = "focus: " + (focusToggle ? "on" : "off"); });
$("uPause").addEventListener("click", togglePause);
$("uDiff").addEventListener("change", showHi);
$("uSound").addEventListener("change", () => { muted = !$("uSound").checked; store.set("muted", muted); });
draw();

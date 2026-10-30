import { W, H, KINDS, newGame, step, bomb, result, bossPhase } from "./bullet-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("bc"), ctx = cv.getContext("2d");
let s = null, raf = 0, last = 0, target = null;
const keys = new Set();

function start() {
  s = newGame((Math.random() * 1e9) | 0);
  target = null; last = performance.now();
  $("bShare").hidden = true; $("bLog").textContent = "";
  $("bStart").textContent = "restart";
  cancelAnimationFrame(raf);
  loop(last);
}

function input() {
  const k = (n) => keys.has(n);
  const i = {
    mx: (k("arrowright") || k("d") ? 1 : 0) - (k("arrowleft") || k("a") ? 1 : 0),
    my: (k("arrowdown") || k("s") ? 1 : 0) - (k("arrowup") || k("w") ? 1 : 0),
    focus: k("shift"),
  };
  if (target && !i.mx && !i.my) { i.tx = target.x; i.ty = target.y; }
  return i;
}

function draw() {
  ctx.fillStyle = "#0d0a12"; ctx.fillRect(0, 0, W, H);
  // checkerboard backdrop, scrolling slowly so there is a sense of motion
  const sq = 60, off = ((s ? s.t : 0) * 30) % (sq * 2);
  ctx.fillStyle = "#15101c";
  for (let r = -2; r < H / sq + 2; r++) for (let c = 0; c < W / sq; c++) if ((r + c) % 2 === 0) ctx.fillRect(c * sq, r * sq + off, sq, sq);
  if (!s) { ctx.fillStyle = "#c9b79c"; ctx.font = "bold 22px system-ui"; ctx.textAlign = "center"; ctx.fillText("press start", W / 2, H / 2); return; }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const e of s.enemies) {
    ctx.font = `${e.r * 2.2}px serif`;
    ctx.fillStyle = e.kind === "queen" ? ["#e8b04a", "#e0607e", "#b57bff"][bossPhase(e)] : "#d9cdb8";
    ctx.fillText(KINDS[e.kind].glyph, e.x, e.y);
  }
  ctx.fillStyle = "#fff6c8";
  for (const b of s.shots) ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
  for (const b of s.bullets) {
    ctx.fillStyle = "#ff5d7a"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, 7); ctx.fill();
  }
  const p = s.p;
  if (!(p.inv > 0 && Math.floor(s.t * 12) % 2)) {
    ctx.font = "34px serif"; ctx.fillStyle = "#f1e9dc"; ctx.fillText("♔", p.x, p.y);
  }
  ctx.fillStyle = "#4ad0ff"; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); // the hitbox
  const q = s.enemies.find((e) => e.kind === "queen");
  if (q) {
    ctx.fillStyle = "#2a2230"; ctx.fillRect(40, 10, W - 80, 8);
    ctx.fillStyle = "#d8584a"; ctx.fillRect(40, 10, (W - 80) * Math.max(0, q.hp / q.max), 8);
  }
}

function ui() {
  $("bScore").textContent = s.score;
  $("bLives").textContent = "♔".repeat(Math.max(0, s.lives)) || "—";
  $("bBombs").textContent = s.bombs;
  $("bGraze").textContent = s.grazes;
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!$("bullet").hidden) step(s, dt, input()); // frozen while another genre is showing
  draw(); ui();
  if (s.over) return end();
  raf = requestAnimationFrame(loop);
}

function end() {
  const r = result(s);
  $("bLog").textContent = r.won
    ? `checkmate! the queen falls. ${r.total} points · ${r.grazes} grazes · ${r.lives} lives left`
    : `captured. ${r.total} points · ${r.grazes} grazes · you reached ${s.enemies.some((e) => e.kind === "queen") ? "the queen" : "wave " + Math.min(16, s.si)}`;
  const txt = r.won ? `I beat the giant queen in Chess Bullet Hell: ${r.total} pts, ${r.grazes} grazes.` : `The giant queen's bullets got me in Chess Bullet Hell: ${r.total} pts, ${r.grazes} grazes.`;
  $("bShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#bullet");
  $("bShare").hidden = false;
  draw();
}

const GAME_KEYS = ["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "shift"];
window.addEventListener("keydown", (e) => {
  if ($("bullet").hidden) return;
  const k = e.key.toLowerCase();
  if (GAME_KEYS.includes(k)) e.preventDefault();
  if (e.repeat) return;
  if ((k === " " || k === "x") && s) bomb(s);
  keys.add(k);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

function point(e) {
  const r = cv.getBoundingClientRect();
  // aim a little above the finger so the king stays visible
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H - 50 };
}
cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); target = point(e); });
cv.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "touch") target = point(e); });
cv.addEventListener("pointerup", () => { target = null; });
cv.addEventListener("pointercancel", () => { target = null; });
$("bStart").addEventListener("click", start);
$("bBomb").addEventListener("click", () => { if (s) bomb(s); });
draw();

// Endless win95-style starfield. Stars live in a box in front of the camera
// (x,y in [-1,1], z in (0,1]) and fly toward the viewer; z wraps back to far.
const $ = (id) => document.getElementById(id);
const canvas = $("c"), ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.width = Math.floor(innerWidth * DPR);
  H = canvas.height = Math.floor(innerHeight * DPR);
}
addEventListener("resize", resize);
resize();

const DEFAULTS = { speed: 0.35, size: 1, density: 800, warp: false, color: 0, paused: false };
const COLORS = ["white", "rainbow", "lilac", "trans"];
// trans flag blue / pink / white, weighted so pink and blue dominate
const TRANS = ["91,206,250", "245,169,184", "255,255,255", "245,169,184", "91,206,250"];
let S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem("stars-saver") || "{}")); } catch {}
const save = () => { try { localStorage.setItem("stars-saver", JSON.stringify(S)); } catch {} };

// Density ceiling is a rendering budget: ~10k fillRects/lines per frame is
// comfortable on phones; beyond that the framerate, not the picture, suffers.
const MAX_STARS = 12000, MIN_STARS = 50;
const pool = [];
const reseed = (s, far) => {
  s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2;
  s.z = far ? 1 : Math.random() * 0.999 + 0.001; s.pz = s.z; s.h = Math.random();
};
function fit() {
  S.density = Math.max(MIN_STARS, Math.min(MAX_STARS, Math.round(S.density)));
  while (pool.length < S.density) { const s = {}; reseed(s, false); pool.push(s); }
  pool.length = S.density;
}
fit();

let toastT = 0;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1400);
}
const spd = () => (S.speed * 100).toFixed(0);

function color(s, a) {
  if (S.color === 1) return `hsla(${Math.round(s.h * 360)},90%,70%,${a})`;
  if (S.color === 2) return `hsla(${270 + Math.round(s.h * 40)},80%,${70 + Math.round(s.h * 25)}%,${a})`;
  if (S.color === 3) return `rgba(${TRANS[Math.min(4, Math.floor(s.h * 5))]},${a})`;
  return `rgba(255,255,255,${a})`;
}

function act(k) {
  switch (k) {
    case "ArrowUp": S.speed = Math.min(3, S.speed * 1.2 + 0.01); toast("speed " + spd()); break;
    case "ArrowDown": S.speed = Math.max(0, S.speed / 1.2 - 0.01); toast("speed " + spd()); break;
    case "ArrowRight": S.size = Math.min(8, S.size * 1.2); toast("size " + S.size.toFixed(1)); break;
    case "ArrowLeft": S.size = Math.max(0.3, S.size / 1.2); toast("size " + S.size.toFixed(1)); break;
    case "]": S.density *= 1.3; fit(); toast("stars " + S.density); break;
    case "[": S.density /= 1.3; fit(); toast("stars " + S.density); break;
    case "w": S.warp = !S.warp; toast(S.warp ? "warp on" : "warp off"); break;
    case "c": S.color = (S.color + 1) % COLORS.length; toast(COLORS[S.color]); break;
    case "t": toggleTilt(); return;
    case " ": S.paused = !S.paused; toast(S.paused ? "paused" : "go"); break;
    case "f": fullscreen(); return;
    case "r": S = { ...DEFAULTS }; fit(); toast("reset"); break;
    case "?": case "h": case "/": $("help").hidden = !$("help").hidden; return;
    case "Escape": $("help").hidden = true; return;
    default: return;
  }
  save();
}
const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
  act(k);
});
addEventListener("wheel", (e) => { act(e.deltaY < 0 ? "ArrowUp" : "ArrowDown"); }, { passive: true });
canvas.addEventListener("dblclick", fullscreen);
$("help").addEventListener("click", () => { $("help").hidden = true; });

// touch: drag vertically = speed, tap = warp, two-finger tap = help
let tp = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  if (tp && tp.id !== e.pointerId) { tp.multi = true; return; }
  tp = { id: e.pointerId, y: e.clientY, t: performance.now(), moved: false, multi: false };
});
canvas.addEventListener("pointermove", (e) => {
  if (!tp || tp.id !== e.pointerId) return;
  const dy = e.clientY - tp.y;
  if (Math.abs(dy) > 24) { tp.moved = true; tp.y = e.clientY; act(dy < 0 ? "ArrowUp" : "ArrowDown"); }
});
const up = (e) => {
  if (!tp) return;
  if (tp.id === e.pointerId) {
    if (!tp.moved && performance.now() - tp.t < 400) act(tp.multi ? "?" : "w");
    tp = null;
  }
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", () => { tp = null; });

// tilt steering: the vanishing point drifts with the phone's orientation, so
// the stars seem to fly where you lean. iOS needs a permission prompt from a gesture.
let tilt = { on: false, raw: null, base: null, vx: 0, vy: 0, tx: 0, ty: 0 };
function onOrient(e) {
  if (e.gamma == null || e.beta == null) return;
  const ang = (screen.orientation && screen.orientation.angle) || 0;
  let x = e.gamma, y = e.beta;
  if (ang === 90) { x = e.beta; y = -e.gamma; }
  else if (ang === 270 || ang === -90) { x = -e.beta; y = e.gamma; }
  else if (ang === 180) { x = -e.gamma; y = -e.beta; }
  tilt.raw = { x, y };
  if (!tilt.base) tilt.base = { x, y };
  // 30 degrees of lean = full deflection
  tilt.tx = Math.max(-1, Math.min(1, (x - tilt.base.x) / 30));
  tilt.ty = Math.max(-1, Math.min(1, (y - tilt.base.y) / 30));
}
async function toggleTilt() {
  if (tilt.on) {
    tilt.on = false; removeEventListener("deviceorientation", onOrient);
    tilt.tx = tilt.ty = 0; toast("tilt off"); return;
  }
  if (typeof DeviceOrientationEvent === "undefined") { toast("no tilt sensor here"); return; }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      if ((await DeviceOrientationEvent.requestPermission()) !== "granted") { toast("tilt permission denied"); return; }
    }
  } catch { toast("tilt unavailable"); return; }
  tilt.on = true; tilt.base = null;
  addEventListener("deviceorientation", onOrient);
  toast("tilt on - lean to steer (T to stop)");
  setTimeout(() => { if (tilt.on && !tilt.raw) { tilt.on = false; removeEventListener("deviceorientation", onOrient); toast("no tilt sensor here"); } }, 2500);
}
$("tiltbtn").addEventListener("click", (e) => { e.stopPropagation(); toggleTilt(); });
if (typeof DeviceOrientationEvent !== "undefined" && matchMedia("(pointer: coarse)").matches) $("tiltbtn").hidden = false;

// hide the cursor when the mouse sits still
let idleT = 0;
addEventListener("mousemove", () => { document.body.classList.remove("idle"); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add("idle"), 2500); });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  try {
    // warp leaves trails by fading instead of clearing, and boosts speed
    ctx.fillStyle = S.warp ? "rgba(0,0,0,0.35)" : "#000";
    ctx.fillRect(0, 0, W, H);
    const sp = S.speed * (S.warp ? 4 : 1) * (S.paused ? 0 : 1);
    tilt.vx += (tilt.tx - tilt.vx) * Math.min(1, dt * 4);
    tilt.vy += (tilt.ty - tilt.vy) * Math.min(1, dt * 4);
    const F = Math.max(W, H) * 0.5, cx = W / 2 + tilt.vx * W * 0.45, cy = H / 2 + tilt.vy * H * 0.45;
    for (const s of pool) {
      s.pz = s.z;
      s.z -= sp * dt;
      if (s.z <= 0.01) { reseed(s, true); continue; }
      const px = cx + (s.x / s.z) * F, py = cy + (s.y / s.z) * F;
      if (px < 0 || px > W || py < 0 || py > H) { reseed(s, true); continue; }
      const a = Math.min(1, 1.15 - s.z), r = Math.max(1, (1 - s.z) * 2.6 * DPR * S.size);
      if (S.warp && s.pz > s.z) {
        const qx = cx + (s.x / s.pz) * F, qy = cy + (s.y / s.pz) * F;
        ctx.strokeStyle = color(s, a); ctx.lineWidth = Math.max(1, r * 0.6);
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
      } else {
        ctx.fillStyle = color(s, a);
        ctx.fillRect(px, py, r, r);
      }
    }
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setTimeout(() => toast("press ? for secret controls"), 600);

import { STARS, OBJECTS, radec } from "./catalog.js";

const $ = (id) => document.getElementById(id);
const canvas = $("c"), ctx = canvas.getContext("2d");
let W = 0, H = 0, F = 1, DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.width = Math.floor(innerWidth * DPR);
  H = canvas.height = Math.floor(innerHeight * DPR);
  F = Math.max(W, H) * 0.6; // focal length in px, ~70° across the long side
}
addEventListener("resize", resize);
resize();

// ---- vector helpers -------------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rot = (v, axis, ang) => { // Rodrigues, axis is unit
  const c = Math.cos(ang), s = Math.sin(ang), k = cross(axis, v), d = dot(axis, v) * (1 - c);
  return [v[0] * c + k[0] * s + axis[0] * d, v[1] * c + k[1] * s + axis[1] * d, v[2] * c + k[2] * s + axis[2] * d];
};

// ---- simulated Milky Way --------------------------------------------------
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry(1995);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// Galactic frame in equatorial coordinates: +x to the galactic centre, +z to the north galactic pole.
const ex = norm(radec(17.761, -29.008, 1)), ez0 = norm(radec(12.857, 27.128, 1));
const ey = norm(cross(ez0, ex)), ez = cross(ex, ey);
const SUN_R = 26700; // ly from the Sun to the galactic centre
const toWorld = (gx, gy, gz) => {
  const x = gx + SUN_R; // centre-origin -> Sun-origin
  return [ex[0] * x + ey[0] * gy + ez[0] * gz, ex[1] * x + ey[1] * gy + ez[1] * gz, ex[2] * x + ey[2] * gy + ez[2] * gz];
};

// Typed arrays: x,y,z (ly), absolute magnitude, rgb. Stand-ins for the ~100 billion real stars:
// absolute magnitudes are drawn brighter than typical so the unresolved glow shows.
const N_DISC = 70000, N_BULGE = 14000, N_LOCAL = 3000;
const N = N_DISC + N_BULGE + N_LOCAL;
const SX = new Float64Array(N), SY = new Float64Array(N), SZ = new Float64Array(N), SM = new Float32Array(N), SC = new Uint8Array(N * 3);
const sim = (() => {
  const tints = [[170, 200, 255], [235, 240, 255], [255, 240, 190], [255, 190, 130]];
  let i = 0;
  const put = (p, M) => {
    SX[i] = p[0]; SY[i] = p[1]; SZ[i] = p[2]; SM[i] = M;
    const t = tints[Math.floor(rnd() * 4)]; SC[i * 3] = t[0]; SC[i * 3 + 1] = t[1]; SC[i * 3 + 2] = t[2]; i++;
  };
  const RMAX = 50000, SCALE = 9000, B = 1 / Math.tan(12 * Math.PI / 180); // 12° pitch log spiral
  for (let k = 0; k < N_DISC; k++) {
    const r = -SCALE * Math.log(1 - rnd() * (1 - Math.exp(-RMAX / SCALE))) + 1500;
    const arm = Math.floor(rnd() * 4);
    let th = rnd() < 0.7 ? arm * Math.PI / 2 + B * Math.log(r / 3000) + gauss() * 0.3 : rnd() * 2 * Math.PI;
    put([r * Math.cos(th), r * Math.sin(th), gauss() * (250 + r * 0.01)], -6 + rnd() * 4);
  }
  for (let k = 0; k < N_BULGE; k++) put([gauss() * 2500, gauss() * 2500, gauss() * 1500], -6 + rnd() * 4);
  for (let k = 0; k < N_LOCAL; k++) {
    const p = [gauss() * 250, gauss() * 250, gauss() * 90]; // the Sun's neighbourhood
    put(p, rnd() * 8);
    const q = [p[0] * ex[0] + p[1] * ey[0] + p[2] * ez[0], p[0] * ex[1] + p[1] * ey[1] + p[2] * ez[1], p[0] * ex[2] + p[1] * ey[2] + p[2] * ez[2]];
    SX[i - 1] = q[0]; SY[i - 1] = q[1]; SZ[i - 1] = q[2];
  }
  // disc + bulge are in galactic coords relative to the centre; rotate those into the world frame
  for (let k = 0; k < N_DISC + N_BULGE; k++) {
    const w = toWorld(SX[k], SY[k], SZ[k]); SX[k] = w[0]; SY[k] = w[1]; SZ[k] = w[2];
  }
  return true;
})();

const named = STARS.map(([name, ra, dec, d, M, col]) => ({ name, p: radec(ra, dec, d), M, col, d }));
const objs = OBJECTS.map(([name, ra, dec, d, size, col]) => ({ name, p: radec(ra, dec, d), size, col, d }));

// ---- camera / state -------------------------------------------------------
const cam = { p: [0, 0, 0], f: ex.slice(), u: ez.slice(), travelled: 0 };
let mode = "galaxy", paused = false, auto = true, labels = true, nearest = 5, speedLY = 2;
const speedEl = $("speed");
const userMul = () => Math.pow(10, speedEl.value / 50); // slider -100..100 -> 0.01x..100x

function right() { return cross(cam.f, cam.u); }
function turn(dx, dy) { // radians
  cam.f = norm(rot(cam.f, cam.u, -dx));
  const r = right();
  cam.f = norm(rot(cam.f, r, -dy));
  cam.u = norm(rot(cam.u, r, -dy));
  // re-orthogonalise
  cam.u = norm(cross(r, cam.f));
}

// drag / touch steering
let drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; canvas.classList.add("drag"); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const k = 1.2 / Math.max(innerWidth, innerHeight);
  if (mode === "galaxy") turn((e.clientX - drag[0]) * k * -1, (e.clientY - drag[1]) * k * -1);
  drag = [e.clientX, e.clientY];
});
const endDrag = () => { drag = null; canvas.classList.remove("drag"); };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.key));
addEventListener("keyup", (e) => keys.delete(e.key));

// ---- classic mode: the win95 starfield -----------------------------------
const CL = Array.from({ length: 700 }, () => ({ x: 0, y: 0, z: 0 }));
function reseed(s, far) { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = far ? 1 : Math.random(); }
CL.forEach((s) => reseed(s, false));
function drawClassic(dt) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const sp = 0.35 * userMul() * (paused ? 0 : 1);
  for (const s of CL) {
    s.z -= sp * dt;
    if (s.z <= 0.01) reseed(s, true);
    const px = W / 2 + (s.x / s.z) * F * 0.5, py = H / 2 + (s.y / s.z) * F * 0.5;
    if (px < 0 || px > W || py < 0 || py > H) { reseed(s, true); continue; }
    const b = Math.min(1, 1.15 - s.z), r = Math.max(1, (1 - s.z) * 2.6 * DPR);
    ctx.fillStyle = `rgba(255,255,255,${b})`;
    ctx.fillRect(px, py, r, r);
  }
  $("readout").textContent = "the original: stars appear in the middle and fly past";
}

// ---- galaxy mode ----------------------------------------------------------
const fmtLY = (d) => d < 1 ? (d * 63241).toFixed(0) + " AU" : d < 1000 ? d.toFixed(d < 10 ? 2 : 0) + " ly" : d < 1e6 ? (d / 1000).toFixed(1) + " kly" : (d / 1e6).toFixed(2) + " Mly";
let near = { name: "", d: 0 };
function drawGalaxy(dt) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const keyTurn = 0.9 * dt;
  if (keys.has("ArrowLeft") || keys.has("a")) turn(-keyTurn, 0);
  if (keys.has("ArrowRight") || keys.has("d")) turn(keyTurn, 0);
  if (keys.has("ArrowUp") || keys.has("w")) turn(0, -keyTurn);
  if (keys.has("ArrowDown") || keys.has("s")) turn(0, keyTurn);

  const r = right(), f = cam.f, u = cam.u, P = cam.p;
  let minAhead = Infinity;
  ctx.globalCompositeOperation = "lighter";
  const cx = W / 2, cy = H / 2;
  const plot = (x, y, z, M, cr, cg, cb) => {
    const dx = x - P[0], dy = y - P[1], dz = z - P[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc <= 0.02) return -1;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (zc < minAhead && dist < 4 * zc) minAhead = zc;
    const sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) / zc * F;
    const sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) / zc * F;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return -1;
    const m = M + 5 * Math.log10(dist / 32.6); // apparent magnitude from real distance modulus
    const a = Math.min(1, Math.max(0, (9 - m) / 9)); 
    if (a <= 0.01) return -1;
    const rad = (0.5 + Math.min(3, Math.max(0, (4 - m) / 2.5))) * DPR;
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${a * a})`;
    ctx.fillRect(sx - rad / 2, sy - rad / 2, rad, rad);
    return 1;
  };
  for (let i = 0; i < N; i++) plot(SX[i], SY[i], SZ[i], SM[i], SC[i * 3], SC[i * 3 + 1], SC[i * 3 + 2]);

  // fuzzy objects: size is physical, so they swell as you approach
  for (const o of objs) {
    const dx = o.p[0] - P[0], dy = o.p[1] - P[1], dz = o.p[2] - P[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc <= 0.02) continue;
    const dist = Math.hypot(dx, dy, dz);
    const sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) / zc * F, sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) / zc * F;
    const rad = Math.max(3 * DPR, (o.size / 2) / zc * F);
    if (sx < -rad || sx > W + rad || sy < -rad || sy > H + rad) continue;
    const al = 0.5;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.min(rad, 4000));
    g.addColorStop(0, `rgba(${o.col},${al})`); g.addColorStop(1, `rgba(${o.col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, Math.min(rad, 4000), 0, 7); ctx.fill();
  }

  // named real stars: bigger, with a soft halo
  ctx.font = `${11 * DPR}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline = "middle";
  let best = { name: "", d: Infinity };
  const marks = [];
  for (const s of named) {
    const dx = s.p[0] - P[0], dy = s.p[1] - P[1], dz = s.p[2] - P[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist < best.d) best = { name: s.name, d: dist };
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc <= 0.02) continue;
    if (zc < minAhead && dist < 4 * zc) minAhead = zc;
    const sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) / zc * F, sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) / zc * F;
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
    const m = s.M + 5 * Math.log10(dist / 32.6);
    const b = Math.min(1, Math.max(0.15, (7 - m) / 8));
    const rad = (1.2 + Math.min(7, Math.max(0, (3 - m) * 1.1))) * DPR;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 3);
    g.addColorStop(0, `rgba(${s.col},${b})`); g.addColorStop(0.25, `rgba(${s.col},${b * 0.5})`); g.addColorStop(1, `rgba(${s.col},0)`);
    ctx.fillStyle = g; ctx.fillRect(sx - rad * 3, sy - rad * 3, rad * 6, rad * 6);
    if (m < 3.5 || dist < 40) marks.push([s.name, sx, sy, dist, rad]);
  }
  for (const o of objs) {
    const dx = o.p[0] - P[0], dy = o.p[1] - P[1], dz = o.p[2] - P[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist - o.size / 2 < best.d) best = { name: o.name, d: Math.max(0, dist) };
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc <= 0.02) continue;
    const sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) / zc * F, sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) / zc * F;
    if (sx > 0 && sx < W && sy > 0 && sy < H) marks.push([o.name, sx, sy, dist, 6 * DPR]);
  }
  ctx.globalCompositeOperation = "source-over";
  if (labels) {
    ctx.fillStyle = "rgba(190,235,255,.85)";
    for (const [name, sx, sy, dist, rad] of marks) ctx.fillText(`${name} · ${fmtLY(dist)}`, sx + rad * 1.5 + 4, sy);
  }
  near = best;

  // movement: ly per second of your time
  const target = auto ? Math.max(0.05, Math.min(minAhead * 0.45, 20000)) : 2;
  nearest += (target - nearest) * Math.min(1, dt * 1.5);
  speedLY = paused ? 0 : (auto ? nearest : 2) * userMul();
  const step = speedLY * dt;
  cam.p = [P[0] + f[0] * step, P[1] + f[1] * step, P[2] + f[2] * step];
  cam.travelled += step;

  const dSun = Math.hypot(cam.p[0], cam.p[1], cam.p[2]);
  $("readout").textContent =
    `speed ${speedLY < 10 ? speedLY.toFixed(2) : speedLY.toFixed(0)} ly/s\n` +
    `from the Sun ${fmtLY(dSun)}\n` +
    `nearest named: ${near.name} (${fmtLY(near.d)})`;
}

// ---- jump targets ---------------------------------------------------------
const JUMPS = [
  ["Sun", [0, 0, 0], null, 0],
  ["Alpha Cen", named[1].p, null, 1],
  ["Orion", objs[1].p, null, 40],
  ["Pleiades", objs[0].p, null, 60],
  ["Galactic centre", objs[2].p, null, 9000],
  ["Andromeda", objs[3].p, null, 600000],
];
function jump(target, back) {
  const dir = norm(target.length && Math.hypot(...target) > 0 ? target : ex);
  const p = Math.hypot(...target) > 0 ? target.map((v, i) => v - dir[i] * back) : [0, 0, 0];
  cam.p = back ? p : [0, 0, 0];
  cam.f = dir;
  const up = Math.abs(dot(dir, ez)) > 0.99 ? ey : ez;
  cam.u = norm(cross(right_of(dir, up), dir));
  nearest = Math.max(0.05, back * 0.3 || 2);
}
function right_of(f, u) { return cross(f, u); }
const gotoRow = $("goto");
for (const [label, pos, , back] of JUMPS) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", () => jump(pos, back));
  gotoRow.appendChild(b);
}

// ---- UI wiring ------------------------------------------------------------
function setMode(m) {
  mode = m;
  $("m-classic").classList.toggle("on", m === "classic");
  $("m-galaxy").classList.toggle("on", m === "galaxy");
  $("galaxyOnly").hidden = m !== "galaxy";
}
$("m-classic").addEventListener("click", () => setMode("classic"));
$("m-galaxy").addEventListener("click", () => setMode("galaxy"));
$("pause").addEventListener("click", (e) => { paused = !paused; e.target.classList.toggle("on", paused); e.target.textContent = paused ? "resume" : "pause"; });
$("full").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); });
$("auto").addEventListener("change", (e) => { auto = e.target.checked; });
$("labels").addEventListener("change", (e) => { labels = e.target.checked; });
const speedV = () => { $("speedv").textContent = "×" + userMul().toFixed(2); };
speedEl.addEventListener("input", speedV); speedV();
$("aboutlink").addEventListener("click", (e) => { e.preventDefault(); $("about").hidden = !$("about").hidden; $("panel").hidden = false; $("tog").textContent = "hide"; });
$("tog").addEventListener("click", () => { const h = !$("panel").hidden; $("panel").hidden = h; $("tog").textContent = h ? "show" : "hide"; });
$("share").addEventListener("click", () => {
  const d = Math.hypot(cam.p[0], cam.p[1], cam.p[2]);
  const text = mode === "galaxy"
    ? `flying through the galaxy: ${fmtLY(d)} from the Sun, ${near.name ? near.name + " is " + fmtLY(near.d) + " away" : ""} ✨\nhttps://stars.bisks.net/`
    : `the win95 stars screensaver, but in a browser ✨\nhttps://stars.bisks.net/`;
  open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
});

// ---- loop -----------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  try { if (mode === "classic") drawClassic(dt); else drawGalaxy(dt); }
  catch (err) { $("readout").textContent = "render error: " + err.message; console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

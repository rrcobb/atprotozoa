import { startPyramid, addPoint, normalize, emptiestDirection, maxDot } from "./hull.js";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

// vertex count at which the polyhedron counts as a sphere: ~190 triangles is
// smooth enough that shading it as a sphere is honest
const GOAL = 96;
const FIELD = 80;          // half-width of the square playfield, world units
const GROW = 1.02;         // radius multiplier per pickup
const START_R = 0.6;
const POP_MS = 350;        // how long a new vertex takes to spring out to full radius

const TIERS = [
  ["🍬", "🪙", "🔩", "🍒", "🧷", "🫘"],
  ["🍎", "🧦", "🔑", "📕", "🥫", "🧀"],
  ["🪑", "📺", "🐕", "📦", "🎸", "🧺"],
  ["🚲", "🛋️", "🐄", "🚗", "🌳", "⛲"],
];

let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

// ---- state ----
let st;
function fresh() {
  const { pts, faces } = startPyramid();
  const items = [];
  // log-uniform sizes so there are always plenty of things just smaller than you
  for (let i = 0; i < 520; i++) {
    const s = 0.15 * Math.pow(30, Math.random());
    const tier = s < 0.5 ? 0 : s < 1.3 ? 1 : s < 2.6 ? 2 : 3;
    const e = TIERS[tier];
    let x, z;
    do { x = (Math.random() * 2 - 1) * FIELD; z = (Math.random() * 2 - 1) * FIELD; } while (Math.hypot(x, z) < 2.5);
    items.push({ x, z, s, e: e[(Math.random() * e.length) | 0], dead: false });
  }
  st = {
    pts, faces, born: pts.map(() => -1e9), // per-vertex birth time (ms)
    items, x: 0, z: 0, vx: 0, vz: 0, r: START_R,
    R: [1, 0, 0, 0, 1, 0, 0, 0, 1], h: 1,     // local -> world rotation, row-major
    picked: 0, t0: performance.now(), won: false, started: false, wonAt: 0,
  };
  st.h = groundHeight(st.R);
  updateHud();
}

function updateHud() {
  const V = st.pts.length, F = st.faces.length;
  $("stats").textContent = `${V} vertices · ${F * 3 / 2} edges · ${F} faces`;
  $("fill").style.width = Math.min(100, ((V - 5) / (GOAL - 5)) * 100) + "%";
}

// ---- input ----
const keys = new Set();
addEventListener("keydown", (e) => { keys.add(e.key.toLowerCase()); if (e.key.startsWith("Arrow")) e.preventDefault(); });
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
let pointer = null;
canvas.addEventListener("pointerdown", (e) => { pointer = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("pointermove", (e) => { if (pointer) pointer = { x: e.clientX, y: e.clientY }; });
addEventListener("pointerup", () => { pointer = null; });
addEventListener("pointercancel", () => { pointer = null; });

function inputDir() {
  let dx = 0, dz = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dz -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dz += 1;
  if (pointer) { // toward the pointer, relative to the ball's screen position
    const b = project(st.x, st.r, st.z);
    const px = pointer.x - (b ? b.x : W / 2), py = pointer.y - (b ? b.y : H / 2);
    if (Math.hypot(px, py) > 12) { dx += px; dz += py; }
  }
  const l = Math.hypot(dx, dz);
  return l ? [dx / l, dz / l] : [0, 0];
}

// ---- math ----
function matMul(A, B) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
}
function axisAngle(ax, ay, az, t) {
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [c + ax * ax * k, ax * ay * k - az * s, ax * az * k + ay * s,
          ay * ax * k + az * s, c + ay * ay * k, ay * az * k - ax * s,
          az * ax * k - ay * s, az * ay * k + ax * s, c + az * az * k];
}
const applyR = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const applyRT = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];

// ---- camera (fixed yaw, looks down at the ball) ----
let cam = { x: 0, y: 5, z: 8, fx: 0, fy: -0.5, fz: -0.85, ux: 0, uy: 0.85, uz: -0.5, focal: 600 };
function updateCam() {
  const d = st.r * 4.5 + 5, h = st.r * 3 + 3.5;
  cam.x = st.x; cam.y = h; cam.z = st.z + d;
  const f = normalize([0, st.r * 0.6 - h, -d]);
  cam.fx = f[0]; cam.fy = f[1]; cam.fz = f[2];
  // right = +x, up = right x forward... for right=(1,0,0): up = (0, -fz, fy)
  cam.ux = 0; cam.uy = -f[2]; cam.uz = f[1];
  cam.focal = Math.min(W, H * 1.25) * 1.05;
}
function project(x, y, z) {
  const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
  const depth = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  if (depth < 0.3) return null;
  const sx = dx, sy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  return { x: W / 2 + (sx / depth) * cam.focal, y: H * 0.55 - (sy / depth) * cam.focal, d: depth, k: cam.focal / depth };
}

// height of the centre above the ground when the lowest vertex touches it (unit radius)
function groundHeight(R) {
  let m = 0;
  for (const p of st.pts) m = Math.min(m, applyR(R, p)[1]);
  return -m;
}

// at rest, topple off a lone vertex or edge until a face lies flat on the ground
function settle(dt) {
  let low = null, ly = 1e9;
  for (const p of st.pts) { const v = applyR(st.R, p); if (v[1] < ly) { ly = v[1]; low = v; } }
  const wx = -low[0], wz = -low[2], l = Math.hypot(wx, wz);
  if (l < 1e-4) return;
  const t = Math.min(0.12, 3 * dt);
  const R2 = matMul(axisAngle(wz / l, 0, -wx / l, t), st.R);
  const h2 = groundHeight(R2);
  if (h2 < st.h - 1e-5) { st.R = R2; st.h = h2; } // only if the centre actually falls
}

// ---- step ----
function pickup(item) {
  item.dead = true;
  const rel = applyRT(st.R, [item.x - st.x, 0, item.z - st.z]);
  rel[1] = -st.r * 0.85 + item.s * 0.3; // items sit on the ground, so the contact point is low on the ball
  let dir = normalize(rel);
  // too close to an existing vertex gives a degenerate sliver; use the biggest gap instead
  if (maxDot(st.pts, dir) > Math.cos(0.16)) dir = emptiestDirection(st.pts);
  st.faces = addPoint(st.pts, st.faces, dir);
  st.born.push(performance.now());
  st.picked++;
  st.r *= GROW;
  st.h = groundHeight(st.R);
  updateHud();
  if (st.pts.length >= GOAL && !st.won) win();
}

function win() {
  st.won = true; st.wonAt = performance.now();
  const secs = Math.round((st.wonAt - st.t0) / 1000);
  $("winstats").textContent = `${st.pts.length} vertices, ${secs}s from pyramid to sphere.`;
  const text = `pyramid → sphere in ${secs}s, ${st.pts.length} vertices 🔺→⚪ polykatamari`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://polykatamari.bisks.net/");
  setTimeout(() => { $("win").hidden = false; }, 1500);
}

function step(dt) {
  const [ix, iz] = inputDir();
  const accel = 14 * (st.started ? 1 : 0);
  st.vx += ix * accel * dt; st.vz += iz * accel * dt;
  const drag = Math.exp(-1.6 * dt);
  st.vx *= drag; st.vz *= drag;
  const maxV = 7 + st.r * 1.5, sp = Math.hypot(st.vx, st.vz);
  if (sp > maxV) { st.vx *= maxV / sp; st.vz *= maxV / sp; }
  st.x += st.vx * dt; st.z += st.vz * dt;
  st.x = Math.max(-FIELD, Math.min(FIELD, st.x)); st.z = Math.max(-FIELD, Math.min(FIELD, st.z));
  // roll like a polyhedron, not a sphere: it pivots over its lowest vertex, so
  // the centre rises as a vertex tips over and drops as the next face lands.
  // Rolling forward about a ground contact moves the centre forward by (centre
  // height) per radian, so angle = distance / height. The lurch is the shape.
  const dist = Math.hypot(st.vx, st.vz) * dt;
  if (dist > 1e-6) {
    const dx = st.vx * dt / dist, dz = st.vz * dt / dist;
    const h0 = st.h;
    const ang = Math.min(0.35, dist / Math.max(0.2, st.h * st.r));
    st.R = matMul(axisAngle(dz, 0, -dx, ang), st.R);
    st.h = groundHeight(st.R);
    // potential energy: climbing onto a vertex costs speed, falling onto a face gives it back
    const dH = (st.h - h0) * st.r, v2 = st.vx * st.vx + st.vz * st.vz;
    if (v2 > 1e-6) {
      const k = Math.sqrt(Math.max(0.04, v2 - 2 * 6 * dH) / v2);
      const kk = Math.min(1.5, Math.max(0.5, k));
      st.vx *= kk; st.vz *= kk;
    }
  } else if (!ix && !iz) {
    settle(dt);
  }
  for (const it of st.items) {
    if (it.dead) continue;
    const d = Math.hypot(it.x - st.x, it.z - st.z);
    if (it.s <= st.r * 1.1) {
      if (d < st.r + it.s * 0.3) pickup(it);
    } else {
      const minD = st.r + it.s * 0.4;
      if (d < minD && d > 0) { // solid: push out and kill the velocity into it
        const nx = (st.x - it.x) / d, nz = (st.z - it.z) / d;
        st.x = it.x + nx * minD; st.z = it.z + nz * minD;
        const vn = st.vx * nx + st.vz * nz;
        if (vn < 0) { st.vx -= vn * nx * 1.4; st.vz -= vn * nz * 1.4; }
      }
    }
  }
}

// ---- draw ----
const LIGHT = normalize([-0.4, 0.8, 0.5]);
function shade(n, base, t) {
  const l = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const k = 0.42 + 0.58 * l;
  // slightly shift hue with height so faces read as separate planes
  return `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
}

function drawGround() {
  const step = 4, span = 44;
  const gx = Math.floor(st.x / step) * step, gz = Math.floor(st.z / step) * step;
  ctx.strokeStyle = "#e2ddd0"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -span; i <= span; i += step) {
    for (const [a, b, c, d] of [[gx + i, gz - span, gx + i, gz + span], [gx - span, gz + i, gx + span, gz + i]]) {
      const p = clipProject(a, 0, b, c, 0, d);
      if (p) { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); }
    }
  }
  ctx.stroke();
  // field edge
  ctx.strokeStyle = "#b8860b"; ctx.lineWidth = 3; ctx.beginPath();
  const c = [[-FIELD, -FIELD], [FIELD, -FIELD], [FIELD, FIELD], [-FIELD, FIELD], [-FIELD, -FIELD]];
  for (let i = 0; i < 4; i++) {
    const p = clipProject(c[i][0], 0, c[i][1], c[i + 1][0], 0, c[i + 1][1]);
    if (p) { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); }
  }
  ctx.stroke();
}
// project a ground segment, trimming the part behind the camera by sampling
function clipProject(x1, y1, z1, x2, y2, z2) {
  let a = project(x1, y1, z1), b = project(x2, y2, z2);
  if (a && b) return [a.x, a.y, b.x, b.y];
  for (let i = 1; i <= 24 && (!a || !b); i++) {
    const t = i / 25;
    if (!a) a = project(x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t);
    else if (!b) b = project(x2 + (x1 - x2) * t, 0, z2 + (z1 - z2) * t);
  }
  return a && b ? [a.x, a.y, b.x, b.y] : null;
}

function drawBall(now) {
  const { pts, faces, R, r } = st;
  const smooth = Math.min(1, (pts.length - 5) / (GOAL - 5));
  const world = pts.map((p, i) => {
    const age = now - st.born[i];
    const pop = age >= POP_MS ? 1 : 0.4 + 0.6 * (1 - Math.pow(1 - age / POP_MS, 3)) + (age < POP_MS ? 0.25 * Math.sin((age / POP_MS) * Math.PI) : 0);
    const v = applyR(R, p);
    return [st.x + v[0] * r * pop, r * st.h + v[1] * r * pop, st.z + v[2] * r * pop];
  });
  const scr = world.map((w) => project(w[0], w[1], w[2]));
  // ground shadow
  const sh = project(st.x, 0, st.z);
  if (sh) { ctx.fillStyle = "#0002"; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, r * sh.k * 1.0, r * sh.k * 0.45, 0, 0, 7); ctx.fill(); }
  const draw = [];
  for (const f of faces) {
    const a = world[f[0]], b = world[f[1]], c = world[f[2]];
    const sa = scr[f[0]], sb = scr[f[1]], sc = scr[f[2]];
    if (!sa || !sb || !sc) continue;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = normalize([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const toCam = [cam.x - cx, cam.y - cy, cam.z - cz];
    if (n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2] <= 0) continue; // back face
    // as vertices fill in, lean the shading normal toward the sphere normal
    const sn = normalize([cx - st.x, cy - r * st.h, cz - st.z]);
    n = normalize([n[0] + (sn[0] - n[0]) * smooth, n[1] + (sn[1] - n[1]) * smooth, n[2] + (sn[2] - n[2]) * smooth]);
    draw.push({ sa, sb, sc, n, d: (sa.d + sb.d + sc.d) / 3, idx: f[0] + f[1] + f[2] });
  }
  draw.sort((p, q) => q.d - p.d);
  const edgeAlpha = Math.max(0, 1 - smooth * 1.15);
  for (const q of draw) {
    const hue = (q.idx * 47) % 40;
    ctx.fillStyle = shade(q.n, [235 - hue, 70 + hue * 2, 60 + hue], smooth);
    ctx.beginPath(); ctx.moveTo(q.sa.x, q.sa.y); ctx.lineTo(q.sb.x, q.sb.y); ctx.lineTo(q.sc.x, q.sc.y); ctx.closePath();
    ctx.fill();
    if (edgeAlpha > 0.02) { ctx.strokeStyle = `rgba(20,23,26,${edgeAlpha * 0.8})`; ctx.lineWidth = 1.2; ctx.stroke(); }
    else { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke(); } // hide seams
  }
}

function render(now) {
  updateCam();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fffdf8"; ctx.fillRect(0, 0, W, H);
  drawGround();
  const ballD = (project(st.x, st.r, st.z) || { d: 0 }).d;
  const vis = [];
  for (const it of st.items) {
    if (it.dead) continue;
    if (Math.abs(it.x - st.x) > 90 || Math.abs(it.z - st.z) > 90) continue;
    const p = project(it.x, it.s * 0.5, it.z);
    if (p && p.x > -100 && p.x < W + 100 && p.y > -100 && p.y < H + 100) vis.push([it, p]);
  }
  vis.sort((a, b) => b[1].d - a[1].d);
  let ballDrawn = false;
  const drawItem = ([it, p]) => {
    const px = it.s * p.k;
    if (px < 3) return;
    const gp = project(it.x, 0, it.z);
    if (gp) { ctx.fillStyle = "#0001"; ctx.beginPath(); ctx.ellipse(gp.x, gp.y, px * 0.5, px * 0.2, 0, 0, 7); ctx.fill(); }
    ctx.font = `${px}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(it.e, p.x, p.y);
    // solid (too big) things get a ring so you can tell them from pickups
    if (it.s > st.r * 1.1) { ctx.strokeStyle = "#f9188066"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(gp.x, gp.y, px * 0.55, px * 0.22, 0, 0, 7); ctx.stroke(); }
  };
  for (const v of vis) {
    if (!ballDrawn && v[1].d < ballD) { drawBall(now); ballDrawn = true; }
    drawItem(v);
  }
  if (!ballDrawn) drawBall(now);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
  render(now);
  requestAnimationFrame(frame);
}

$("go").onclick = () => { $("intro").hidden = true; st.started = true; st.t0 = performance.now(); };
$("again").onclick = () => { $("win").hidden = true; fresh(); $("intro").hidden = true; st.started = true; };
fresh();
requestAnimationFrame(frame);

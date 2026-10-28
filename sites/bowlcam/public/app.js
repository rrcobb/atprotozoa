// bowlcam — a tiny orthographic sphere renderer. In an orthographic projection
// a sphere is always a perfect disc, so the whole scene is discs sorted by depth.
const V = (x, y, z) => ({ x, y, z });
const L = (() => { const l = V(-0.4, 0.8, -0.5), n = Math.hypot(l.x, l.y, l.z); return V(l.x / n, l.y / n, l.z / n); })();

// views: [label, yaw°, pitch°]. pitch>0 = camera below looking up. Index 4 is the waterline cam (centre tile).
const VIEWS = [
  ["front", 0, 0], ["back", 180, 0], ["left", 90, 0],
  ["right", -90, 0], ["WATERLINE CAM", 20, 78], ["top", 0, -90],
  ["iso", 35, -30], ["from below", 0, 60], ["three-quarter low", 50, 22],
];
const CAM = 4;

// ---- static scene -----------------------------------------------------------
const statics = [];
const ring = (n, r, y, rad, col, k) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; statics.push({ p: V(Math.cos(a) * r, y, Math.sin(a) * r), r: rad, col, a: k }); } };
ring(28, 1.05, 1.3, 0.1, [236, 238, 240], 1);          // bowl rim
ring(32, 1.2, 1.46, 0.1, [196, 150, 100], 1);          // seat
ring(20, 0.95, 0.8, 0.085, [226, 230, 234], 0.8);      // bowl wall
ring(16, 0.8, 0.35, 0.085, [226, 230, 234], 0.8);
ring(12, 0.68, -0.05, 0.085, [226, 230, 234], 0.8);
// the human (abstract: cheeks, thighs, torso, feet)
const SKIN = [226, 170, 140];
[[-0.36, 2.05, 0.0, 0.52], [0.36, 2.05, 0.0, 0.52], [0, 2.15, 0.3, 0.5],
 [-0.4, 2.15, 0.95, 0.33], [0.4, 2.15, 0.95, 0.33], [-0.4, 2.1, 1.5, 0.28], [0.4, 2.1, 1.5, 0.28],
 [-0.42, 1.0, 1.75, 0.3], [0.42, 1.0, 1.75, 0.3], [-0.42, 0.2, 1.8, 0.3], [0.42, 0.2, 1.8, 0.3],
 [0, 3.0, -0.15, 0.7], [0, 3.8, -0.2, 0.62], [0, 4.6, -0.25, 0.5]]
  .forEach(([x, y, z, r]) => statics.push({ p: V(x, y, z), r, col: SKIN, a: 1 }));
const BROWN = [110, 70, 36];

// ---- dynamic sim ------------------------------------------------------------
let beads, parts, ripples, t, nextDrop, dropsLeft, swirl, speed = 1, logLines = [], sndOn = false, actx = null;

function say(s) { logLines.push(`t+${t.toFixed(1)}s  ${s}`); logLines = logLines.slice(-5); document.getElementById("log").innerHTML = logLines.map(l => `<div>${l}</div>`).join(""); }
function plop(f) {
  if (!sndOn) return;
  try {
    actx = actx || new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain(), n = actx.currentTime;
    o.frequency.setValueAtTime(f, n); o.frequency.exponentialRampToValueAtTime(f * 0.3, n + 0.18);
    g.gain.setValueAtTime(0.25, n); g.gain.exponentialRampToValueAtTime(0.001, n + 0.22);
    o.connect(g).connect(actx.destination); o.start(n); o.stop(n + 0.25);
  } catch (_) { /* no audio available; the visuals carry it */ }
}

function reset() {
  beads = []; parts = []; ripples = []; t = 0; swirl = 0; logLines = [];
  dropsLeft = 2 + Math.floor(Math.random() * 4); nextDrop = 1.2;
  say("camera mounted at waterline. orthographic. no perspective was harmed.");
}
const REMARKS = ["contact.", "a modest plop.", "displacement nominal.", "that one had weight.", "ripple front expanding.", "sphere acquired."];
function spawn() {
  // a short chain of beads, each its own sphere
  const n = 3 + Math.floor(Math.random() * 3), r = 0.17 + Math.random() * 0.07;
  const x = (Math.random() - 0.5) * 0.3, z = (Math.random() - 0.5) * 0.3;
  for (let i = 0; i < n; i++) beads.push({ p: V(x + Math.sin(i) * 0.04, 1.75 + i * r * 1.5, z), v: 0, r: r * (1 - i * 0.05), hit: false, sink: 0 });
  say("descent commenced.");
  dropsLeft--; nextDrop = t + 1.2 + Math.random() * 1.8;
}
function step(dt) {
  t += dt;
  if (dropsLeft > 0 && t >= nextDrop) spawn();
  if (dropsLeft === 0 && !beads.length && !swirl && !step.done) { step.done = true; say("session complete. press flush, or new session."); }
  for (const b of beads) {
    if (!b.hit) {
      b.v -= 9 * dt; b.p.y += b.v * dt;
      if (b.p.y - b.r <= 0) {
        b.hit = true; b.p.y = 0 - b.r * 0.2; plop(180 + Math.random() * 120);
        ripples.push({ x: b.p.x, z: b.p.z, age: 0 });
        for (let k = 0; k < 9; k++) { const a = Math.random() * 6.28, s = 0.8 + Math.random() * 1.4; parts.push({ p: V(b.p.x, 0.05, b.p.z), v: V(Math.cos(a) * s * 0.5, s * 1.6, Math.sin(a) * s * 0.5), life: 0 }); }
        if (Math.random() < 0.5) say(REMARKS[Math.floor(Math.random() * REMARKS.length)]);
      }
    } else { b.sink += dt; b.p.y -= dt * 0.25; if (swirl) { const a = Math.atan2(b.p.z, b.p.x) + dt * 6, d = Math.hypot(b.p.x, b.p.z) * (1 - dt * 0.8); b.p.x = Math.cos(a) * d; b.p.z = Math.sin(a) * d; b.p.y -= dt * 1.2; } }
  }
  beads = beads.filter(b => b.p.y > -0.9);
  for (const q of parts) { q.v.y -= 9 * dt; q.p.x += q.v.x * dt; q.p.y += q.v.y * dt; q.p.z += q.v.z * dt; q.life += dt; }
  parts = parts.filter(q => q.p.y > 0 && q.life < 1.2);
  for (const r of ripples) r.age += dt;
  ripples = ripples.filter(r => r.age < 2.2);
  if (swirl) { swirl -= dt; if (swirl <= 0) { swirl = 0; beads = []; say("bowl empty. the human is still there."); } }
}

// ---- projection + render ----------------------------------------------------
function basis(yawDeg, pitchDeg) {
  const y = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
  // camera sits at direction d from the origin looking back at it; pitch>0 puts it below
  const d = V(Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p));
  const f = V(-d.x, -d.y, -d.z);                       // forward
  let r = V(f.z, 0, -f.x); const rl = Math.hypot(r.x, r.z);
  if (rl < 1e-6) r = V(Math.cos(y), 0, -Math.sin(y)); else r = V(r.x / rl, 0, r.z / rl);
  const u = V(r.y * f.z - r.z * f.y, r.z * f.x - r.x * f.z, r.x * f.y - r.y * f.x);
  return { r, u, f };
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

function render(ctx, w, h, yaw, pitch, isCam) {
  const B = basis(yaw, pitch), S = Math.min(w, h) / 11.5, cx = w / 2, cy = h * 0.5 + (pitch === -90 || pitch === 0 ? 0 : 0);
  const C = V(0, 1.6, 0.4); // look-at centre
  const proj = p => { const q = V(p.x - C.x, p.y - C.y, p.z - C.z); return { x: cx + dot(q, B.r) * S, y: cy - dot(q, B.u) * S, d: dot(q, B.f) }; };
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, isCam ? "#1a2a2e" : "#131c20"); g.addColorStop(1, "#0a0f11");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  const items = [];
  const add = (p, rad, col, a, kind) => { const s = proj(p); items.push({ s, rad: rad * S, col, a, kind }); };
  for (const o of statics) add(o.p, o.r, o.col, o.a);
  for (const b of beads) add(b.p, b.r, BROWN, 1);
  for (const q of parts) add(q.p, 0.05, [150, 205, 235], Math.max(0, 1 - q.life / 1.2));
  // water: a translucent disc on y=0 (an ellipse via the projected basis), sorted at its centre
  items.push({ s: proj(V(0, 0, 0)), kind: "water" });

  items.sort((a, b) => b.s.d - a.s.d);
  for (const it of items) {
    if (it.kind === "water") { drawWater(ctx, proj, S, B); continue; }
    const { s, rad, col, a } = it;
    const lx = dot(L, B.r), ly = dot(L, B.u), lz = dot(L, B.f);
    const gr = ctx.createRadialGradient(s.x + lx * rad * 0.4, s.y - ly * rad * 0.4, rad * 0.1, s.x, s.y, rad);
    const k = 0.55 + 0.45 * Math.max(0, -lz * 0.5 + 0.5);
    gr.addColorStop(0, `rgba(${Math.min(255, col[0] * k + 50)},${Math.min(255, col[1] * k + 50)},${Math.min(255, col[2] * k + 50)},${a})`);
    gr.addColorStop(1, `rgba(${col[0] * k * 0.55},${col[1] * k * 0.55},${col[2] * k * 0.55},${a})`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.6, rad), 0, 6.283); ctx.fill();
  }
}

function drawWater(ctx, proj, S, B) {
  const o = proj(V(0, 0, 0)), ex = proj(V(1, 0, 0)), ez = proj(V(0, 0, 1));
  // unit circle in the water plane -> affine map of the two projected axes
  const ax = (ex.x - o.x), ay = (ex.y - o.y), bx = (ez.x - o.x), by = (ez.y - o.y);
  const edge = Math.abs(ax * by - ay * bx) < 0.02 * S * S; // viewed exactly edge-on
  ctx.save(); ctx.transform(ax, ay, bx, by, o.x, o.y);
  if (edge) { ctx.restore(); ctx.strokeStyle = "rgba(120,190,230,.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x - 0.72 * S, o.y); ctx.lineTo(o.x + 0.72 * S, o.y); ctx.stroke(); return; }
  ctx.fillStyle = swirl ? "rgba(90,160,210,.55)" : "rgba(80,160,215,.42)";
  ctx.beginPath(); ctx.arc(0, 0, 0.72, 0, 6.283); ctx.fill();
  ctx.lineWidth = 0.025; ctx.strokeStyle = "rgba(200,235,255,.75)";
  for (const r of ripples) { ctx.globalAlpha = Math.max(0, 1 - r.age / 2.2); ctx.beginPath(); ctx.arc(r.x, r.z, Math.min(0.72, r.age * 0.45) + 0.02, 0, 6.283); ctx.stroke(); }
  if (swirl) { ctx.globalAlpha = 0.8; for (let i = 0; i < 3; i++) { ctx.beginPath(); for (let a = 0; a < 9; a += 0.2) { const rr = 0.7 * (1 - a / 10), an = a + i * 2.09 + t * 6; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.stroke(); } }
  ctx.restore();
}

// ---- UI ---------------------------------------------------------------------
const grid = document.getElementById("grid");
const tiles = VIEWS.map(([name, yaw, pitch], i) => {
  const d = document.createElement("div"); d.className = "tile" + (i === CAM ? " cam" : "");
  const c = document.createElement("canvas"), lab = document.createElement("div"); lab.className = "lab"; lab.textContent = `${i + 1}/9 ${name}`;
  d.append(c, lab); grid.append(d);
  d.addEventListener("click", () => { const on = !d.classList.contains("sel"); tiles.forEach(x => x.el.classList.remove("sel")); grid.classList.toggle("focus", on); if (on) d.classList.add("sel"); size(); });
  return { el: d, c, ctx: c.getContext("2d"), yaw, pitch, i };
});
function size() {
  const dpr = window.devicePixelRatio || 1;
  for (const T of tiles) { const r = T.el.getBoundingClientRect(); if (!r.width) continue; T.c.width = r.width * dpr; T.c.height = r.height * dpr; T.w = r.width; T.h = r.height; T.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
}
window.addEventListener("resize", size);
document.getElementById("again").addEventListener("click", () => { step.done = false; reset(); });
document.getElementById("flush").addEventListener("click", () => { if (!swirl) { swirl = 2.2; say("flushing. camera is fine. camera is fine."); } });
document.getElementById("snd").addEventListener("change", e => { sndOn = e.target.checked; });
document.getElementById("speed").addEventListener("input", e => { speed = +e.target.value; });
const shareText = "bowlcam: nine orthographic views of a human defecating, one from the waterline. everything is a sphere.";
document.getElementById("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText + " https://bowlcam.bisks.net/");

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed; last = now;
  step(dt);
  for (const T of tiles) if (T.w) render(T.ctx, T.w, T.h, T.yaw, T.pitch, T.i === CAM);
  requestAnimationFrame(frame);
}
reset(); size(); requestAnimationFrame(frame);

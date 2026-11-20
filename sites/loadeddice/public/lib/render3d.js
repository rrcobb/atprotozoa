// Painter's-algorithm renderer for the dice tray, straight onto a 2D canvas.
// Convex solids only need back-face culling plus a sort between dice, so no
// depth buffer or WebGL is needed.
import { TRAY } from "./physics.js";

const CAM = [0, 8.6, 10.8], LOOK = [0, 0.2, 0];
const LIGHT = norm([-0.45, 1, 0.6]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

const FWD = norm(sub(LOOK, CAM));
const RIGHT = norm(cross(FWD, [0, 1, 0]));
const UP = cross(RIGHT, FWD);
const FOCAL = 1.9; // in half-widths of the canvas

export function project(p, w, h) {
  const d = sub(p, CAM);
  const z = dot(d, FWD);
  const s = (FOCAL * (w / 2)) / z;
  return [w / 2 + dot(d, RIGHT) * s, h * 0.5 - dot(d, UP) * s, z, s];
}

export function qAxis(axis, ang) {
  const a = norm(axis), s = Math.sin(ang / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)];
}

// base hue per die so the set reads as a set
const HUES = [38, 12, 160, 205, 285, 330, 90];

export function drawScene(ctx, bodies, rot, w, h, opts = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0908";
  ctx.fillRect(0, 0, w, h);

  // tray floor + low walls
  const corner = (x, y, z) => project([x, y, z], w, h);
  const poly = (pts, fill, stroke) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const X = TRAY.x, Z = TRAY.z, WH = 0.9;
  poly([corner(-X, 0, -Z), corner(X, 0, -Z), corner(X, 0, Z), corner(-X, 0, Z)], "#1d3a2c", "#2d5a44");
  poly([corner(-X, 0, -Z), corner(X, 0, -Z), corner(X, WH, -Z), corner(-X, WH, -Z)], "#2a1d12", "#4a3320");
  poly([corner(-X, 0, -Z), corner(-X, 0, Z), corner(-X, WH, Z), corner(-X, WH, -Z)], "#33241a", "#4a3320");
  poly([corner(X, 0, -Z), corner(X, 0, Z), corner(X, WH, Z), corner(X, WH, -Z)], "#33241a", "#4a3320");

  // soft shadows first, then dice far-to-near
  for (const b of bodies) {
    const c = project([b.pos[0], 0, b.pos[2]], w, h);
    const k = Math.max(0.25, 1 - b.pos[1] / 9);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * k})`;
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], b.rb * c[3] * 1.05, b.rb * c[3] * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const order = bodies.map((b, i) => ({ b, i, z: project(b.pos, w, h)[2] })).sort((a, b) => b.z - a.z);
  for (const { b, i } of order) drawDie(ctx, b, i, rot(b), w, h, opts);
}

function drawDie(ctx, b, di, rotFn, w, h, opts) {
  const hue = HUES[di % HUES.length];
  const verts = b.poly.verts.map((v) => { const r = rotFn(v); return [b.pos[0] + r[0], b.pos[1] + r[1], b.pos[2] + r[2]]; });
  const proj = verts.map((v) => project(v, w, h));
  const faces = [];
  for (const [fi, f] of b.poly.faces.entries()) {
    const n = rotFn(f.n);
    const c = rotFn(f.c);
    const wc = [b.pos[0] + c[0], b.pos[1] + c[1], b.pos[2] + c[2]];
    const view = sub(wc, CAM);
    if (dot(n, view) >= 0) continue; // faces away
    faces.push({ fi, f, n, wc, z: dot(view, FWD) });
  }
  faces.sort((a, c) => c.z - a.z);
  for (const { fi, f, n, wc } of faces) {
    const lam = Math.max(0, dot(n, LIGHT));
    const isTop = b.settled && fi === b.top;
    const l = 26 + lam * 38 + (isTop ? 14 : 0);
    ctx.beginPath();
    f.idx.forEach((vi, k) => (k ? ctx.lineTo(proj[vi][0], proj[vi][1]) : ctx.moveTo(proj[vi][0], proj[vi][1])));
    ctx.closePath();
    ctx.fillStyle = `hsl(${hue} ${isTop ? 85 : 62}% ${l}%)`;
    ctx.fill();
    ctx.strokeStyle = isTop ? "#fff" : "rgba(10,9,8,.75)";
    ctx.lineWidth = isTop ? 2 : 1;
    ctx.stroke();
    // label: face value, sized by how big the face looks on screen
    const label = b.labels && b.labels[fi];
    if (label !== undefined) {
      let area = 0;
      for (let k = 0; k < f.idx.length; k++) {
        const p = proj[f.idx[k]], q = proj[f.idx[(k + 1) % f.idx.length]];
        area += p[0] * q[1] - q[0] * p[1];
      }
      const px = Math.sqrt(Math.abs(area) / 2) * 0.55;
      if (px >= 7) {
        const c = project(wc, w, h);
        ctx.font = `700 ${Math.min(26, px)}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = `hsl(${hue} 40% ${l > 45 ? 10 : 92}%)`;
        ctx.fillText(String(label), c[0], c[1]);
      }
    }
  }
  void opts;
}

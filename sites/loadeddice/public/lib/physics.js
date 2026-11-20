// A tiny rigid-body toss for convex dice in a walled tray. No DOM.
// Honest simplifications: every die uses a sphere's moment of inertia (about its
// centre of mass, which geometry.js already centres on the origin), dice hit the
// floor and walls through their vertices, and dice hit each other as spheres.
import { topFaceUp } from "./geometry.js";

export const TRAY = { x: 4.6, z: 3.0 };   // half-extents of the tray floor
const G = 34;                              // gravity: dice are ~1.5 units wide, so this reads as a table-top toss
const SUB = 1 / 240;                       // physics step
const E = 0.32, MU = 0.55;                 // bounciness, friction
const rot = (q, v) => {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
export const qRot = rot;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function randQuat(rand) {
  const u = rand(), v = rand() * 2 * Math.PI, w = rand() * 2 * Math.PI;
  return [Math.sqrt(1 - u) * Math.sin(v), Math.sqrt(1 - u) * Math.cos(v), Math.sqrt(u) * Math.sin(w), Math.sqrt(u) * Math.cos(w)];
}

export function makeBody(poly) {
  let r2 = 0;
  for (const v of poly.verts) r2 += (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / poly.verts.length;
  return {
    poly, pos: [0, 2, 0], vel: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],
    invI: 1 / (0.4 * r2), // m = 1
    rb: Math.sqrt(r2) * 0.95,  // bounding-sphere radius for die-die contact
    still: 0, kicks: 0, settled: false, top: -1,
  };
}

// Throw the dice in from the near edge of the tray, spinning.
export function throwDice(bodies, rand = Math.random) {
  bodies.forEach((b, i) => {
    b.pos = [-TRAY.x + 0.8 + rand() * 0.8, 2.6 + i * 1.5 + rand(), (rand() - 0.5) * TRAY.z * 1.2];
    b.vel = [9 + rand() * 7, 2 + rand() * 4, (rand() - 0.5) * 7];
    b.q = randQuat(rand);
    b.w = [(rand() - 0.5) * 36, (rand() - 0.5) * 36, (rand() - 0.5) * 36];
    b.still = 0; b.kicks = 0; b.settled = false; b.top = -1;
  });
}

function planeContacts(b, n, off) {
  // vertices behind the plane n.x >= off: bounce them off, with friction
  let depth = 0;
  for (const v of b.poly.verts) {
    const r = rot(b.q, v);
    const d = (b.pos[0] + r[0]) * n[0] + (b.pos[1] + r[1]) * n[1] + (b.pos[2] + r[2]) * n[2] - off;
    if (d >= 0) continue;
    depth = Math.max(depth, -d);
    const vp = [b.vel[0] + b.w[1] * r[2] - b.w[2] * r[1], b.vel[1] + b.w[2] * r[0] - b.w[0] * r[2], b.vel[2] + b.w[0] * r[1] - b.w[1] * r[0]];
    const vn = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
    if (vn >= 0) continue;
    const rn = cross(r, n);
    const k = 1 + b.invI * (rn[0] * rn[0] + rn[1] * rn[1] + rn[2] * rn[2]);
    const jn = (-(1 + (vn < -2 ? E : 0)) * vn) / k;
    for (let i = 0; i < 3; i++) b.vel[i] += jn * n[i];
    const tq = cross(r, n);
    for (let i = 0; i < 3; i++) b.w[i] += b.invI * jn * tq[i];
    // friction along the sliding direction
    const vt = [vp[0] - vn * n[0], vp[1] - vn * n[1], vp[2] - vn * n[2]];
    const vtl = Math.hypot(vt[0], vt[1], vt[2]);
    if (vtl > 1e-6) {
      const t = vt.map((x) => x / vtl);
      const rt = cross(r, t);
      const kt = 1 + b.invI * (rt[0] * rt[0] + rt[1] * rt[1] + rt[2] * rt[2]);
      const jt = Math.min(MU * jn, vtl / kt);
      for (let i = 0; i < 3; i++) b.vel[i] -= jt * t[i];
      const tq2 = cross(r, t);
      for (let i = 0; i < 3; i++) b.w[i] -= b.invI * jt * tq2[i];
    }
  }
  if (depth > 0) for (let i = 0; i < 3; i++) b.pos[i] += n[i] * depth;
}

function integrate(b, dt, rand) {
  b.vel[1] -= G * dt;
  const damp = Math.exp(-0.9 * dt);
  for (let i = 0; i < 3; i++) { b.pos[i] += b.vel[i] * dt; b.w[i] *= damp; }
  const [wx, wy, wz] = b.w, [x, y, z, w] = b.q;
  b.q = [
    x + 0.5 * dt * (wx * w + wy * z - wz * y),
    y + 0.5 * dt * (wy * w + wz * x - wx * z),
    z + 0.5 * dt * (wz * w + wx * y - wy * x),
    w + 0.5 * dt * (-wx * x - wy * y - wz * z),
  ];
  const l = Math.hypot(...b.q);
  b.q = b.q.map((c) => c / l);
  planeContacts(b, [0, 1, 0], 0);
  planeContacts(b, [1, 0, 0], -TRAY.x);
  planeContacts(b, [-1, 0, 0], -TRAY.x);
  planeContacts(b, [0, 0, 1], -TRAY.z);
  planeContacts(b, [0, 0, -1], -TRAY.z);
}

function collide(a, b) {
  const d = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]];
  const dist = Math.hypot(...d), min = a.rb + b.rb;
  if (dist >= min || dist < 1e-6) return;
  const n = d.map((x) => x / dist), push = (min - dist) / 2;
  for (let i = 0; i < 3; i++) { a.pos[i] -= n[i] * push; b.pos[i] += n[i] * push; }
  const vn = (b.vel[0] - a.vel[0]) * n[0] + (b.vel[1] - a.vel[1]) * n[1] + (b.vel[2] - a.vel[2]) * n[2];
  if (vn >= 0) return;
  const j = (-(1 + 0.4) * vn) / 2;
  for (let i = 0; i < 3; i++) { a.vel[i] -= j * n[i]; b.vel[i] += j * n[i]; }
}

// Advance by dt seconds (many small steps). Returns true once every die has come to rest.
export function stepWorld(bodies, dt, rand = Math.random) {
  let t = 0;
  while (t < dt) {
    for (const b of bodies) if (!b.settled) integrate(b, SUB, rand);
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j]);
    t += SUB;
    for (const b of bodies) {
      if (b.settled) continue;
      const sp = Math.hypot(...b.vel), sw = Math.hypot(...b.w);
      b.still = sp < 0.25 && sw < 0.6 ? b.still + SUB : 0;
      if (b.still > 0.3) {
        // resting flat? the best-aligned face normal should point straight down
        const inv = qConj(b.q);
        const down = rot(inv, [0, -1, 0]);
        let best = -1;
        for (const f of b.poly.faces) best = Math.max(best, f.n[0] * down[0] + f.n[1] * down[1] + f.n[2] * down[2]);
        if (best > 0.985 || b.kicks >= 6) {
          b.settled = true; b.vel = [0, 0, 0]; b.w = [0, 0, 0];
          b.top = topFaceUp(b.poly, (v) => rot(inv, v));
        } else {
          // balanced on an edge or corner: a real die would be nudged by the table. nudge it.
          b.kicks++; b.still = 0;
          b.w = [(rand() - 0.5) * 4, (rand() - 0.5) * 4, (rand() - 0.5) * 4];
          b.vel[1] += 1.5;
        }
      }
    }
  }
  return bodies.every((b) => b.settled);
}

// Two-body Keplerian propagation: turn (a, e, i, Ω, ω, M0, period) + a date
// into a 3D Cartesian position, using the standard closed-form rotation
// (this is the same math behind any textbook "orbital elements to state
// vector" routine — no perturbations, no N-body coupling, which is the
// documented simplification this whole site makes).

import { EPOCH } from "./data.js";

const D2R = Math.PI / 180;

// Solve Kepler's equation M = E - e sin E for E, given M in radians.
function solveEccentricAnomaly(M, e) {
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = e < 0.8 ? M : Math.PI;
  for (let iter = 0; iter < 50; iter++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

// daysSince(epoch) for a JS Date/ms timestamp.
export function daysSinceEpoch(ms) {
  return (ms - EPOCH) / 86400000;
}

// body: { a, e, i, Om, w, period, M0 } — angles in degrees, a in whatever
// length unit the caller wants back (AU for planets, km for moons).
// Returns { x, y, z } in that same unit, in a fixed (non-rotating)
// heliocentric-ecliptic-like reference frame.
export function positionAt(body, days, m0deg) {
  const n = 360 / body.period; // mean motion, deg/day
  const M0 = (m0deg !== undefined ? m0deg : body.M0 || 0) * D2R;
  const M = M0 + n * days * D2R;
  const e = body.e;
  const E = solveEccentricAnomaly(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = body.a * (1 - e * Math.cos(E));

  const i = body.i * D2R;
  const Om = (body.Om || 0) * D2R;
  const w = (body.w || 0) * D2R;
  const u = w + nu; // argument of latitude

  const cosOm = Math.cos(Om), sinOm = Math.sin(Om);
  const cosU = Math.cos(u), sinU = Math.sin(u);
  const cosI = Math.cos(i), sinI = Math.sin(i);

  const x = r * (cosOm * cosU - sinOm * sinU * cosI);
  const y = r * (sinOm * cosU + cosOm * sinU * cosI);
  const z = r * (sinU * sinI);
  return { x, y, z, r, trueAnomaly: nu };
}

export function vsub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function vadd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function vscale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function vlen(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
export function vdot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function vnorm(a) {
  const l = vlen(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
export function angleBetween(a, b) {
  const cosT = Math.max(-1, Math.min(1, vdot(a, b) / (vlen(a) * vlen(b))));
  return Math.acos(cosT);
}

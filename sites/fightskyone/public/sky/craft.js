// Shared flying: a craft keeps a unit forward vector and a speed, turns its
// nose toward where it wants to go at a limited rate, and banks into the turn
// (more for tighter, faster turns), so every jet flies the same way.

import * as THREE from './vendor/three.module.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _l = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

export function makeCraft(pos, fwd, speed) {
  return { pos: pos.clone(), fwd: fwd.clone().normalize(), speed, bank: 0, roll: 0, quat: new THREE.Quaternion(), vel: new THREE.Vector3(), turn: 0 };
}

// Turn toward `want` (unit) at up to `rate` rad/s.
export function steer(c, want, rate, dt) {
  const old = _a.copy(c.fwd);
  const ang = old.angleTo(want);
  if (ang > 1e-5) {
    const axis = _l.crossVectors(old, want);
    if (axis.lengthSq() < 1e-12) axis.copy(UP);
    c.fwd.applyAxisAngle(axis.normalize(), Math.min(ang, rate * dt));
  }
  // Never quite vertical, so the horizon stays defined.
  if (Math.abs(c.fwd.y) > 0.94) {
    const h = Math.hypot(c.fwd.x, c.fwd.z) || 1;
    const s = Math.sqrt(1 - 0.94 * 0.94) / h;
    c.fwd.set(c.fwd.x * s, Math.sign(c.fwd.y) * 0.94, c.fwd.z * s);
  }
  c.fwd.normalize();
  // Sideways turn rate (to the right) sets the bank: coordinated-ish.
  const right = _r.crossVectors(old, UP).normalize();
  const lateral = _u.subVectors(c.fwd, old).dot(right) / Math.max(dt, 1e-4);
  c.turn = lateral;
  const want_bank = THREE.MathUtils.clamp(Math.atan(lateral * c.speed / 9.81) * 0.9, -1.35, 1.35);
  c.bank += (want_bank - c.bank) * Math.min(1, dt * 3);
}

export function move(c, dt) {
  c.vel.copy(c.fwd).multiplyScalar(c.speed);
  c.pos.addScaledVector(c.vel, dt);
}

// Orientation from forward, world up, the bank and any extra roll (barrel
// rolls). Model axes: +Z nose, +Y up, +X left wing.
export function orient(c) {
  const f = c.fwd;
  const right = _r.crossVectors(f, UP).normalize();
  const up = _u.crossVectors(right, f).normalize();
  const left = _l.copy(right).negate();
  _m.makeBasis(left, up, f);
  c.quat.setFromRotationMatrix(_m);
  _q.setFromAxisAngle(_a.set(0, 0, 1), c.bank + c.roll);
  c.quat.multiply(_q);
  return c.quat;
}

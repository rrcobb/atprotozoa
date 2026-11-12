// Lock on and "fire": point at a jet to lock it (its author shows on the
// lock box), click to send a missile, and the burst where it lands is the
// post opening. Nobody is hurt: the jet rolls away, marked as read.

import * as THREE from './vendor/three.module.js';
import { makeJetMaterial } from './jetmodel.js';
import { LIT, GLOW } from './particles.js';
import { JET_SCALE } from './traffic.js';

const LOCK_CONE = THREE.MathUtils.degToRad(6);
const KEEP_CONE = THREE.MathUtils.degToRad(28);
const LOCK_RANGE = 7000, KEEP_RANGE = 9500;
const LOCK_TIME = 0.5;
const MAX_MISSILES = 3;

function missileGeometry() {
  const g = new THREE.CylinderGeometry(0.18, 0.18, 3.4, 6, 1).rotateX(Math.PI / 2).toNonIndexed();
  const fins = new THREE.BoxGeometry(1.0, 0.06, 0.5).translate(0, 0, -1.4).toNonIndexed();
  const fins2 = new THREE.BoxGeometry(0.06, 1.0, 0.5).translate(0, 0, -1.4).toNonIndexed();
  const parts = [g, fins, fins2];
  const pos = [], nrm = [], kind = [];
  for (const p of parts) {
    pos.push(...p.attributes.position.array);
    nrm.push(...p.attributes.normal.array);
    for (let i = 0; i < p.attributes.position.count; i++) kind.push(1);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  return out;
}

export class Combat {
  constructor(scene, camera, player, traffic, particles, audio, { onBurst }) {
    this.audio = audio;
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.traffic = traffic;
    this.particles = particles;
    this.onBurst = onBurst;
    this.geo = missileGeometry();
    this.mat = makeJetMaterial(new THREE.Color(0.85, 0.86, 0.88));
    this.missiles = [];
    this.candidate = null;
    this.lockT = 0;
    this.locked = null;
    this.lostT = 0;
    this.cooldown = 0;
    this.side = 1;
    this.ray = new THREE.Raycaster();
  }

  // Angle between the aim ray (camera through the cursor) and a jet, and its range.
  aimed(j, dir) {
    const to = j.craft.pos.clone().sub(this.camera.position);
    const d = to.length();
    return { ang: to.divideScalar(d).angleTo(dir), d };
  }

  aimRay() {
    this.ray.setFromCamera(this.player.aimOn ? this.player.aim : new THREE.Vector2(), this.camera);
    return this.ray.ray.direction;
  }

  // Tab: lock the next jet in view, nearest the aim first.
  cycle() {
    const dir = this.aimRay();
    const list = this.traffic.jets.map(j => ({ j, ...this.aimed(j, dir) }))
      .filter(x => x.d < LOCK_RANGE && x.ang < KEEP_CONE).sort((a, b) => a.ang - b.ang);
    if (!list.length) return;
    const i = list.findIndex(x => x.j === this.locked);
    this.locked = list[(i + 1) % list.length].j;
    this.audio.locked();
    this.candidate = null;
    this.lockT = 0;
  }

  fire() {
    if (this.cooldown > 0 || this.missiles.length >= MAX_MISSILES) return false;
    this.cooldown = 0.45;
    const c = this.player.craft;
    const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(c.quat), down = new THREE.Vector3(0, -1, 0).applyQuaternion(c.quat);
    this.side = -this.side;
    const pos = c.pos.clone().addScaledVector(right, this.side * 3).addScaledVector(down, 1.2);
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.frustumCulled = false;
    mesh.scale.setScalar(1.6);
    this.scene.add(mesh);
    const dir = this.locked ? c.fwd.clone() : this.aimRay().clone();
    this.audio.launch(this.side);
    this.missiles.push({ mesh, pos, vel: c.fwd.clone().multiplyScalar(c.speed).addScaledVector(down, 25), dir, target: this.locked, age: 0, speed: c.speed });
    return true;
  }

  update(dt, active) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const jets = this.traffic.jets;
    if (this.locked && !jets.includes(this.locked)) this.locked = null;
    if (active) {
      const dir = this.aimRay();
      // Keep a lock while the jet stays roughly ahead and in range.
      if (this.locked) {
        const a = this.aimed(this.locked, dir);
        if (a.ang > KEEP_CONE || a.d > KEEP_RANGE) { this.lostT += dt; if (this.lostT > 1) { this.locked = null; this.audio.lost(); } } else this.lostT = 0;
      }
      // A new candidate: the jet nearest the cursor within the cone.
      let best = null, ba = LOCK_CONE;
      for (const j of jets) {
        const a = this.aimed(j, dir);
        if (a.d < LOCK_RANGE && a.ang < ba) { ba = a.ang; best = j; }
      }
      if (best && best !== this.locked) {
        if (best !== this.candidate) { this.candidate = best; this.lockT = 0; this.audio.lockTick(); }
        this.lockT += dt;
        if (this.lockT >= LOCK_TIME) { this.locked = best; this.candidate = null; this.lostT = 0; this.audio.locked(); }
      } else {
        this.candidate = null;
        this.lockT = 0;
      }
    } else {
      this.locked = this.candidate = null;
    }
    this.updateMissiles(dt);
  }

  updateMissiles(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.age += dt;
      m.speed = Math.min(720, m.speed + dt * 520);
      let want = m.dir;
      const t = m.target;
      if (t && this.traffic.jets.includes(t) && m.age > 0.2) {
        const d = t.craft.pos.distanceTo(m.pos);
        const lead = t.craft.pos.clone().addScaledVector(t.craft.vel, Math.min(3, d / Math.max(m.speed, 1)));
        want = lead.sub(m.pos).normalize();
      }
      const cur = m.vel.clone().normalize();
      const ang = cur.angleTo(want);
      if (ang > 1e-4) cur.applyAxisAngle(tmp.crossVectors(cur, want).normalize(), Math.min(ang, (m.age > 0.2 ? 4.5 : 0) * dt));
      const prev = m.pos.clone();
      m.vel.copy(cur).multiplyScalar(m.speed);
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cur);
      // Smoke and the motor's flame along the step.
      for (let k = 0; k < 3; k++) {
        const p = prev.clone().lerp(m.pos, k / 3);
        this.particles.spawn(p, cur.clone().multiplyScalar(-10).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4)),
          { life: 3.5 + Math.random() * 1.5, size0: 1.5, size1: 9, drag: 1, kind: LIT, col0: new THREE.Color(0.85, 0.85, 0.85), col1: new THREE.Color(0.6, 0.6, 0.62), alpha: 0.85 });
      }
      this.particles.spawn(m.pos.clone().addScaledVector(cur, -3), cur.clone().multiplyScalar(-40), { life: 0.12, size0: 2.2, size1: 0.8, kind: GLOW, col0: new THREE.Color(1, 0.9, 0.6), col1: new THREE.Color(1, 0.45, 0.1) });
      // Hit: closest approach along this step within the (scaled) jet's size.
      let hit = null;
      if (t && this.traffic.jets.includes(t)) {
        const seg = new THREE.Line3(prev, m.pos), cp = new THREE.Vector3();
        seg.closestPointToPoint(t.craft.pos, true, cp);
        if (cp.distanceTo(t.craft.pos) < 9 * JET_SCALE) hit = t;
      }
      if (hit || m.age > 7 || m.pos.y < 0) {
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        if (hit) {
          const at = hit.craft.pos.clone().addScaledVector(hit.craft.fwd, 6);
          this.burst(at, hit);
          const rel = at.clone().sub(this.camera.position), right = new THREE.Vector3();
          this.camera.getWorldDirection(right);
          right.set(-right.z, 0, right.x).normalize();
          this.audio.impact(rel.length(), rel.dot(right) / Math.max(rel.length(), 1));
          this.traffic.hit(hit);
          if (this.locked === hit) this.locked = null;
          this.onBurst(hit, at);
        } else { this.fizzle(m.pos); this.audio.fizzle(); }
      }
    }
  }

  // The burst: a white flash, a fireball, sparks in the author's colour, then
  // smoke drifting off on the wind.
  burst(p, j) {
    const P = this.particles, v = new THREE.Vector3(), base = j.craft.vel.clone().multiplyScalar(0.35);
    const rnd = s => v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(s * (0.4 + Math.random() * 0.6)).add(base);
    P.spawn(p, base, { life: 0.3, size0: 30, size1: 90, kind: GLOW, col0: new THREE.Color(1, 1, 0.92), col1: new THREE.Color(1, 0.8, 0.5) });
    for (let i = 0; i < 26; i++) P.spawn(p, rnd(90), { life: 0.8 + Math.random() * 0.9, size0: 10, size1: 34, drag: 2.5, kind: GLOW, col0: new THREE.Color(1, 0.85, 0.45), col1: new THREE.Color(0.55, 0.12, 0.04) });
    const paint = j.paint.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
    for (let i = 0; i < 40; i++) P.spawn(p, rnd(260), { life: 1.2 + Math.random(), size0: 3.5, size1: 1.5, drag: 1.4, kind: GLOW, col0: paint, col1: new THREE.Color(1, 0.9, 0.6) });
    for (let i = 0; i < 18; i++) P.spawn(p, rnd(40), { life: 5 + Math.random() * 3, size0: 18, size1: 70, drag: 1, kind: LIT, col0: new THREE.Color(0.35, 0.33, 0.32), col1: new THREE.Color(0.7, 0.7, 0.72), alpha: 0.85 });
  }

  fizzle(p) {
    for (let i = 0; i < 8; i++) this.particles.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), { life: 3, size0: 6, size1: 24, drag: 1, kind: LIT, col0: new THREE.Color(0.8, 0.8, 0.8), alpha: 0.7 });
  }
}

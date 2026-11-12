// Your jet and the camera.
//  - fly mode: the jet turns toward wherever the cursor points (a virtual
//    stick: hold it off-centre to keep turning), W/S set the throttle, A/D and
//    the arrow keys turn and climb too. It can't crash: near the ground or the
//    sea it pulls up by itself.
//  - behind the feed: an autopilot drifts between the clouds while the chase
//    camera slowly swings round.

import * as THREE from './vendor/three.module.js';
import { makeCraft, steer, move, orient } from './craft.js';
import { buildJetGeometry, makeJetMaterial } from './jetmodel.js';
import { heightAt } from './terrain.js';
import { LIT, GLOW } from './particles.js';

const UP = new THREE.Vector3(0, 1, 0);
const MIN_V = 130, MAX_V = 390;

export class Player {
  constructor(scene, camera, particles) {
    this.camera = camera;
    this.particles = particles;
    this.mat = makeJetMaterial(new THREE.Color(0.55, 0.6, 0.66));
    this.mesh = new THREE.Mesh(buildJetGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(1);
    scene.add(this.mesh);
    this.craft = makeCraft(new THREE.Vector3(0, 2200, 0), new THREE.Vector3(0, 0, 1), 220);
    this.throttle = 0.4;
    this.keys = new Set();
    this.aim = new THREE.Vector2();      // cursor, NDC
    this.aimOn = false;
    this.fly = false;
    this.auto = { wp: new THREE.Vector3(), t: 0 };
    this.camQ = new THREE.Quaternion();
    this.camPos = new THREE.Vector3();
    this.orbit = 0;
    this.trail = 0;
    this.time = 0;
    this.ray = new THREE.Raycaster();
    this.deck = 0;   // undercast top: the autopilot cruises above it
    this.startSafe();
  }

  get pos() { return this.craft.pos; }

  // Start over land or sea, clear of the ground and below the cloud tops.
  startSafe() {
    const c = this.craft;
    c.pos.y = Math.max(Math.max(heightAt(c.pos.x, c.pos.z), 0) + 1500, this.deck + 550);
    this.newWaypoint(null);
    this.camPos.copy(c.pos).addScaledVector(c.fwd, -40).addScaledVector(UP, 10);
  }

  setPaint(rgb) { this.mat.uniforms.uPaint.value.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255); }

  // Autopilot: a gentle wander, now and then past a cloud.
  newWaypoint(clouds) {
    const c = this.craft, wp = this.auto.wp;
    const list = clouds?.list || [];
    const near = list.filter(k => Math.hypot(k.x + clouds.drift.x - c.pos.x, k.z + clouds.drift.z - c.pos.z) < 9000 &&
      new THREE.Vector3(k.x + clouds.drift.x - c.pos.x, 0, k.z + clouds.drift.z - c.pos.z).normalize().dot(c.fwd) > 0.3);
    if (near.length && Math.random() < 0.6) {
      const k = near[Math.floor(Math.random() * near.length)];
      const side = Math.random() < 0.5 ? -1 : 1;
      wp.set(k.x + clouds.drift.x + side * k.r * 1.1, Math.max((k.y0 + Math.min(k.y1, k.y0 + 800)) / 2, this.deck + 450), k.z + clouds.drift.z);
    } else {
      const a = Math.atan2(c.fwd.z, c.fwd.x) + (Math.random() - 0.5) * 2;
      wp.set(c.pos.x + Math.cos(a) * 7000, 0, c.pos.z + Math.sin(a) * 7000);
      wp.y = Math.max(Math.max(heightAt(wp.x, wp.z), 0) + 900, this.deck + 350) + Math.random() * 1600;
    }
    this.auto.t = 0;
  }

  // Where the cursor points, as a direction from the jet.
  aimDir(out) {
    this.ray.setFromCamera(this.aim, this.camera);
    return out.copy(this.camera.position).addScaledVector(this.ray.ray.direction, 2500).sub(this.craft.pos).normalize();
  }

  update(dt, clouds) {
    this.time += dt;
    const c = this.craft, k = this.keys, has = x => k.has(x);
    let want = new THREE.Vector3(), rate = 0.25;
    if (this.fly) {
      this.throttle = THREE.MathUtils.clamp(this.throttle + ((has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0)) * dt * 0.6, 0, 1);
      if (this.aimOn) this.aimDir(want); else want.copy(c.fwd);
      // Keys add a turn on top of the cursor.
      const yaw = (has('KeyA') || has('ArrowLeft') ? 1 : 0) - (has('KeyD') || has('ArrowRight') ? 1 : 0);
      const pitch = (has('ArrowUp') ? 1 : 0) - (has('ArrowDown') ? 1 : 0);
      if (yaw) want.applyAxisAngle(UP, yaw * 0.6);
      if (pitch) want.addScaledVector(UP, pitch * 0.6);
      want.normalize();
      rate = 0.95;
    } else {
      this.throttle = 0.35;
      this.auto.t += dt;
      if (c.pos.distanceTo(this.auto.wp) < 900 || this.auto.t > 60) this.newWaypoint(clouds);
      want.copy(this.auto.wp).sub(c.pos).normalize();
      want.y = THREE.MathUtils.clamp(want.y, -0.15, 0.15);
      want.normalize();
    }
    // The ground (and the sea) push the nose up: no crashing in this sky.
    const ahead = Math.max(heightAt(c.pos.x + c.fwd.x * 600, c.pos.z + c.fwd.z * 600), heightAt(c.pos.x, c.pos.z), 0);
    const agl = c.pos.y - ahead;
    if (agl < 220) { want.y = Math.max(want.y, THREE.MathUtils.lerp(0.6, 0, agl / 220)); want.normalize(); rate = Math.max(rate, 0.8); }
    if (c.pos.y > 9000) { want.y = Math.min(want.y, -0.1); want.normalize(); }
    steer(c, want, rate, dt);
    const target = MIN_V + (MAX_V - MIN_V) * this.throttle - c.fwd.y * 60;
    c.speed += (target - c.speed) * Math.min(1, dt * 0.6);
    move(c, dt);
    const floor = Math.max(heightAt(c.pos.x, c.pos.z), 0) + 25;
    if (c.pos.y < floor) c.pos.y = floor;
    orient(c);
    this.mesh.position.copy(c.pos);
    this.mesh.quaternion.copy(c.quat);
    this.mat.uniforms.uBurnOne.value = this.throttle;
    this.trail -= dt;
    if (this.trail <= 0) { this.trail = 0.05; this.exhaust(); }
    this.updateCamera(dt);
  }

  exhaust() {
    const c = this.craft, high = THREE.MathUtils.smoothstep(c.pos.y, 1800, 3500);
    const right = new THREE.Vector3().crossVectors(c.fwd, UP).normalize();
    for (const s of [-1, 1]) {
      const p = c.pos.clone().addScaledVector(c.fwd, -9).addScaledVector(right, s * 0.5);
      this.particles.spawn(p, c.fwd.clone().multiplyScalar(-20), { life: 1.5 + high * 5, size0: 1.2, size1: 4 + high * 9, drag: 0.6, kind: LIT, col0: new THREE.Color(0.95, 0.95, 0.95), alpha: 0.25 + high * 0.55 });
    }
    if (this.throttle > 0.85) {
      const p = c.pos.clone().addScaledVector(c.fwd, -10.5);
      this.particles.spawn(p, c.fwd.clone().multiplyScalar(-30), { life: 0.18, size0: 1.6, size1: 0.6, kind: GLOW, col0: new THREE.Color(1, 0.75, 0.4), col1: new THREE.Color(0.5, 0.6, 1) });
    }
  }

  // Chase camera: behind and above, leaning a little with the bank; it lags
  // the jet's turns so you see them. Behind the feed it swings slowly round.
  updateCamera(dt) {
    const c = this.craft, cam = this.camera;
    const q = new THREE.Quaternion().copy(c.quat);
    // Only part of the bank: the horizon tilts, but less than the jet.
    const unbank = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -(c.bank + c.roll) * 0.65);
    q.multiply(unbank);
    this.camQ.slerp(q, Math.min(1, dt * (this.fly ? 4 : 1.5)));
    if (!this.fly) this.orbit = Math.sin(this.time * 0.045) * 1.1 + Math.sin(this.time * 0.017) * 0.6;
    else this.orbit *= Math.max(0, 1 - dt * 2);
    const turn = new THREE.Quaternion().setFromAxisAngle(UP, this.orbit);
    const fq = turn.multiply(this.camQ);
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(fq), up = new THREE.Vector3(0, 1, 0).applyQuaternion(fq);
    const dist = this.fly ? 38 : 55;
    const eye = c.pos.clone().addScaledVector(back, dist).addScaledVector(up, this.fly ? 8.5 : 14);
    // Never under the ground.
    eye.y = Math.max(eye.y, Math.max(heightAt(eye.x, eye.z), 0) + 6);
    cam.position.copy(eye);
    cam.up.copy(up);
    cam.lookAt(c.pos.clone().addScaledVector(back, -600).addScaledVector(up, this.fly ? 8.5 : 0));
    cam.updateMatrixWorld();
  }
}

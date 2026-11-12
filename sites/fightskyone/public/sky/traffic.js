// The other jets: each one is a post from someone you follow. New posts fly
// in first; when few jets are around, older posts fly in again (least
// recently shown first), so the sky stays busy. Each jet is painted loosely
// in its author's profile picture colour, leaves a contrail, blinks its nav
// lights, and roams waypoints round the player. Being hit with a missile only
// opens its post: the jet rolls away, marked as read.

import * as THREE from './vendor/three.module.js';
import { makeCraft, steer, move, orient } from './craft.js';
import { buildJetGeometry, makeJetMaterial } from './jetmodel.js';
import { heightAt } from './terrain.js';
import { avatarColour, xrpc } from './feed.js';
import { LIT, GLOW } from './particles.js';

export const MAX_JETS = 14;
const FEW = 9;
const POOL = 80;
const SCALE = 2.2;          // drawn larger than life so they read from afar
const STAY = 240;           // seconds before a jet heads off
const GONE = 12000;         // further than this from the player: gone
const TAU = Math.PI * 2;

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

const NAV_VS = /* glsl */ `
attribute vec3 aCol;
attribute float aBlink;
uniform float uTime;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float on = aBlink < 0.0 ? 1.0 : step(0.88, fract(uTime * 0.9 + aBlink));
  vCol = aCol * on;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = on > 0.5 ? (aBlink < 0.0 ? 1.0 : 2.0) : 0.0;
}`;
const NAV_FS = /* glsl */ `
varying vec3 vCol;
void main() { if (dot(vCol, vCol) < 0.01) discard; gl_FragColor = vec4(vCol, 1.0); }`;

export class Traffic {
  constructor(scene, particles, U, { marks, saveMark }) {
    this.particles = particles;
    this.marks = marks;
    this.saveMark = saveMark;
    this.mesh = new THREE.InstancedMesh(buildJetGeometry(), makeJetMaterial(), MAX_JETS);
    this.mesh.geometry.setAttribute('aBurn', new THREE.InstancedBufferAttribute(new Float32Array(MAX_JETS), 1));
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_JETS * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.layers.enable(1);
    scene.add(this.mesh);
    // Nav lights: left wing red, right wing green, tail strobe white.
    const n = MAX_JETS * 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aBlink', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.nav = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime }, vertexShader: NAV_VS, fragmentShader: NAV_FS }));
    this.nav.frustumCulled = false;
    scene.add(this.nav);
    this.jets = [];
    this.queue = [];
    this.pool = new Map();
    this.people = {};
    this.colours = {};
    this.nextLaunch = 0;
    this.time = 0;
  }

  setPeople(people, colours = {}) {
    this.people = people;
    Object.assign(this.colours, colours);
  }

  arrive(post) {
    if (!this.people[post.did]) return;
    post.key = `${post.did}/${post.rkey}`;
    if (this.pool.has(post.key)) return;
    post.read = !!this.marks[post.key];
    post.shownAt = 0;
    this.pool.set(post.key, post);
    if (this.pool.size > POOL) {
      const oldest = [...this.pool.values()].filter(p => !this.onStage(p)).sort((a, b) => a.at - b.at)[0];
      if (oldest) this.pool.delete(oldest.key);
    }
    this.queue.push(post);
    if (this.queue.length > MAX_JETS) this.queue.splice(0, this.queue.length - MAX_JETS);
  }

  onStage(p) { return this.jets.some(j => j.post === p); }

  nextFromPool() {
    let best = null;
    for (const p of this.pool.values()) {
      if (this.onStage(p) || this.queue.includes(p)) continue;
      if (!best || p.shownAt < best.shownAt) best = p;
    }
    return best;
  }

  // Paint: the author's picture colour, a little deeper so it reads in the
  // light; a hashed colour until the picture has been looked at.
  paintFor(did) {
    const c = this.colours[did];
    if (Array.isArray(c)) return new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);
    if (c === undefined) {
      this.colours[did] = 'pending';
      const av = this.people[did]?.[2];
      if (av) avatarColour(av).then(rgb => { this.colours[did] = rgb; this.repaint(did); }).catch(() => {});
    }
    return new THREE.Color().setHSL(hash(did), 0.45, 0.5);
  }

  repaint(did) {
    for (const j of this.jets) if (j.post.did === did) j.paint = this.paintFor(did);
  }

  pickWaypoint(j, player) {
    const a = Math.random() * TAU, r = 1200 + Math.random() * 4000;
    const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
    const floor = Math.max(heightAt(x, z), 0) + 450;
    const y = Math.max(floor, Math.min(5200, player.pos.y + (Math.random() - 0.5) * 1800));
    j.wp.set(x, y, z);
  }

  launch(post, player) {
    const a = Math.random() * TAU, r = 6000 + Math.random() * 2500;
    const pos = new THREE.Vector3(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r);
    pos.y = Math.max(Math.max(heightAt(pos.x, pos.z), 0) + 600, player.pos.y + (Math.random() - 0.5) * 1200);
    const toward = player.pos.clone().sub(pos).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
    const j = {
      post, craft: makeCraft(pos, toward, 170 + Math.random() * 70), paint: this.paintFor(post.did),
      wp: new THREE.Vector3(), state: 'roam', since: this.time, rate: 0.3 + Math.random() * 0.25,
      trail: 0, rollT: -1, blink: Math.random(),
    };
    this.pickWaypoint(j, player);
    this.jets.push(j);
    post.shownAt = this.time;
  }

  leave(j) {
    if (!j) return;
    j.state = 'out';
    j.wp.copy(j.craft.pos).addScaledVector(j.craft.fwd.clone().setY(0).normalize(), 15000).setY(j.craft.pos.y + 1500);
  }

  // Hit by a missile: a victory roll and a shower of flares, then on its way.
  hit(j) {
    j.rollT = 0;
    j.post.read = true;
    this.marks[j.post.key] = 2;
    this.saveMark();
  }

  update(dt, player) {
    this.time += dt;
    const t = this.time;
    if (t >= this.nextLaunch && this.jets.length >= MAX_JETS) {
      // Full: the longest-flying jet heads off to make room.
      if (this.queue.length && !this.jets.some(j => j.state === 'out')) this.leave(this.jets.find(j => j.state === 'roam'));
      this.nextLaunch = t + 2;
    } else if (t >= this.nextLaunch) {
      const around = this.jets.filter(j => j.state !== 'out').length;
      const post = this.queue.shift() || (around < FEW ? this.nextFromPool() : null);
      if (post) {
        this.launch(post, player);
        this.nextLaunch = t + (around < 4 ? 1.5 : around < FEW ? 4 : 8);
      }
    }
    const pPos = player.pos;
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i], c = j.craft;
      const far = c.pos.distanceTo(pPos);
      if (far > GONE) { this.jets.splice(i, 1); continue; }
      if (j.state === 'roam' && t - j.since > STAY && far > 2500) this.leave(j);
      if (j.state === 'roam' && c.pos.distanceTo(j.wp) < 700) this.pickWaypoint(j, player);
      // Keep clear of the ground: pull up hard when low.
      const ground = Math.max(heightAt(c.pos.x + c.fwd.x * 800, c.pos.z + c.fwd.z * 800), heightAt(c.pos.x, c.pos.z), 0);
      const want = j.wp.clone().sub(c.pos).normalize();
      if (c.pos.y - ground < 350) want.y = Math.max(want.y, 0.5);
      want.normalize();
      steer(c, want, j.rate, dt);
      if (j.rollT >= 0) {
        j.rollT += dt;
        const k = Math.min(1, j.rollT / 1.6);
        c.roll = TAU * (k * k * (3 - 2 * k));
        if (j.rollT < 1.2 && Math.random() < dt * 30) { this.flare(c); if (Math.random() < 0.3 && c.pos.distanceTo(player.pos) < 3000) this.audio?.flare((Math.random() - 0.5) * 0.6); }
        if (k >= 1) { j.rollT = -1; c.roll = 0; }
      }
      move(c, dt);
      orient(c);
      j.trail -= dt;
      if (j.trail <= 0) { j.trail = 0.07; this.contrail(j); }
    }
    this.draw();
  }

  contrail(j) {
    const c = j.craft, high = THREE.MathUtils.smoothstep(c.pos.y, 1800, 3500);
    const tail = c.pos.clone().addScaledVector(c.fwd, -9.5 * SCALE);
    const white = j.post.read ? new THREE.Color(0.78, 0.86, 1) : new THREE.Color(0.95, 0.95, 0.95);
    this.particles.spawn(tail, c.fwd.clone().multiplyScalar(-15), {
      life: 2.5 + high * 6, size0: 2.5, size1: 8 + high * 18, drag: 0.6, kind: LIT, col0: white, alpha: 0.35 + high * 0.5,
    });
  }

  flare(c) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 80, -20 - Math.random() * 40, (Math.random() - 0.5) * 80).addScaledVector(c.fwd, c.speed * 0.6);
    this.particles.spawn(c.pos, v, { life: 1.6, size0: 5, size1: 2, drag: 0.8, kind: GLOW, col0: new THREE.Color(1, 0.95, 0.7), col1: new THREE.Color(1, 0.45, 0.15) });
  }

  draw() {
    const m = new THREE.Matrix4(), s = new THREE.Vector3(SCALE, SCALE, SCALE);
    const burn = this.mesh.geometry.attributes.aBurn;
    const np = this.nav.geometry.attributes.position, nc = this.nav.geometry.attributes.aCol, nb = this.nav.geometry.attributes.aBlink;
    const tip = new THREE.Vector3();
    this.jets.forEach((j, i) => {
      const c = j.craft;
      this.mesh.setMatrixAt(i, m.compose(c.pos, c.quat, s));
      this.mesh.setColorAt(i, j.paint);
      burn.setX(i, THREE.MathUtils.clamp((c.speed - 150) / 120, 0, 1));
      const lights = [[5.7, -0.15, -5.0, 1, 0.15, 0.1, -1], [-5.7, -0.15, -5.0, 0.2, 1, 0.3, -1], [0, 3.7, -7.6, 1, 1, 1, j.blink]];
      lights.forEach(([x, y, z, r, g, b, bl], k) => {
        tip.set(x, y, z).multiplyScalar(SCALE).applyQuaternion(c.quat).add(c.pos);
        np.setXYZ(i * 3 + k, tip.x, tip.y, tip.z);
        nc.setXYZ(i * 3 + k, r, g, b);
        nb.setX(i * 3 + k, bl);
      });
    });
    this.mesh.count = this.jets.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    burn.needsUpdate = true;
    this.nav.geometry.setDrawRange(0, this.jets.length * 3);
    np.needsUpdate = nc.needsUpdate = nb.needsUpdate = true;
  }
}

export { SCALE as JET_SCALE, xrpc };

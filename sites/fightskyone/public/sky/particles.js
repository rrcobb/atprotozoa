// Contrails, missile smoke, flares and fireballs: one GPU particle system.
// Each particle is written once when it's spawned (start, velocity, life,
// sizes, colours); the shader works out where it is and how faded from the
// shared clock, so nothing is updated per frame. Puffs are round, screen-door
// transparent (dithered) and either lit like the clouds or self-lit.

import * as THREE from './vendor/three.module.js';
import { U, makePs1Material } from './ps1/materials.js';

const CAP = 16000;

export const LIT = 0, GLOW = 1;

export class Particles {
  constructor(scene) {
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = {
      aA: new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4),   // x y z t0
      aB: new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4),   // vx vy vz life
      aC: new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4),   // size0 size1 drag kind
      aCol0: new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4), // rgb opacity
      aCol1: new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3),
    };
    for (const [k, v] of Object.entries(this.a)) { v.setUsage(THREE.DynamicDrawUsage); quad.setAttribute(k, v); }
    quad.instanceCount = CAP;
    // Never drawn until spawned: born in the far future.
    for (let i = 0; i < CAP; i++) this.a.aA.array[i * 4 + 3] = 1e9;
    this.mat = makePs1Material({ uWindV: { value: new THREE.Vector3(7, 0, 3) } }, /* glsl */ `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aCol0;
attribute vec3 aCol1;
uniform vec3 uWindV;
varying vec2 vUv;
varying vec3 vCol;
varying float vFade;
varying float vKind;
varying vec3 vWorld;
void main() {
  float age = uTime - aA.w;
  if (age < 0.0 || age > aB.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = age / aB.w;
  float drag = max(aC.z, 1e-3);
  vec3 p = aA.xyz + aB.xyz * (1.0 - exp(-age * drag)) / drag + uWindV * age;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = mix(aC.x, aC.y, sqrt(k));
  mv.xy += position.xy * size;
  vUv = position.xy;
  vCol = mix(aCol0.rgb, aCol1, k);
  vFade = aCol0.a * (1.0 - k * k) * smoothstep(0.0, 0.08, k + 0.02);
  vKind = aC.w;
  vWorld = p;
  gl_Position = psx(projectionMatrix * mv);
}`, /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vFade;
varying float vKind;
varying vec3 vWorld;
void main() {
  if (isShadowPass()) discard;
  float d = length(vUv);
  float b = bayer4(gl_FragCoord.xy);
  float near = smoothstep(12.0, 70.0, distance(vWorld, cameraPosition));
  if (d > 1.0 || b > vFade * near * (1.0 - smoothstep(0.55, 1.0, d))) discard;
  vec3 c = vCol;
  if (vKind < 0.5) {
    float lit = dot(normalize(vec3(vUv, 0.6)), normalize(vec3(0.0, 0.4, 1.0))) * 0.3 + 0.7;
    c *= uAmbient * 0.7 + uSunColor * uSunStrength * 0.55 * lit;
    c = applyFog(c, vWorld);
  } else {
    c = mix(c, applyFog(c, vWorld), 0.5);
  }
  gl_FragColor = vec4(c, 1.0);
}`);
    this.mesh = new THREE.Mesh(quad, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.next = 0;
    this.lo = CAP;
    this.hi = -1;
  }

  // p, v: Vector3s. o: { life, size0, size1, drag, kind, col0, col1, alpha }
  spawn(p, v, o) {
    const i = this.next;
    this.next = (i + 1) % CAP;
    const { aA, aB, aC, aCol0, aCol1 } = this.a;
    aA.setXYZW(i, p.x, p.y, p.z, U.uTime.value);
    aB.setXYZW(i, v.x, v.y, v.z, o.life);
    aC.setXYZW(i, o.size0, o.size1 ?? o.size0, o.drag ?? 0.001, o.kind ?? LIT);
    const c0 = o.col0, c1 = o.col1 || o.col0;
    aCol0.setXYZW(i, c0.r, c0.g, c0.b, o.alpha ?? 1);
    aCol1.setXYZ(i, c1.r, c1.g, c1.b);
    this.lo = Math.min(this.lo, i);
    this.hi = Math.max(this.hi, i);
  }

  flush() {
    if (this.hi < 0) return;
    for (const a of Object.values(this.a)) {
      a.clearUpdateRanges();
      a.addUpdateRange(this.lo * a.itemSize, (this.hi - this.lo + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    this.lo = CAP;
    this.hi = -1;
  }
}

// Clouds to fly among, at kilometre scale.
//  - cumulus: each cloud a cauliflower stack of instanced low-poly puffs (flat
//    bases, darker undersides, quantised wrapped light, dithered fluffy edges
//    and a silver lining against the sun), after Eternal Plight's gas giant
//    cloud puffs. They sit on a jittered grid of cells, drift with the wind and
//    fade (screen-door) as the camera flies into them.
//  - deck: a billowing undercast with holes, for skies flown above the clouds.
//  - cirrus: thin high streaks.
// Clouds also render into the shadow map, so their shadows drift across the
// land, the sea and the jets.

import * as THREE from './vendor/three.module.js';
import { makePs1Material } from './ps1/materials.js';
import { NOISE_GLSL, heightAt } from './noise.js';

export const WEATHER = {
  scattered: { cover: 0.42, base: 1500, size: [500, 1300], towers: 0.08, deck: 0, cirrus: 0.35 },
  broken:    { cover: 0.7, base: 1700, size: [600, 1500], towers: 0.12, deck: 0, cirrus: 0.75 },
  undercast: { cover: 0.18, base: 1250, size: [700, 1600], towers: 0.55, deck: 1250, cirrus: 0.25 },
  towers:    { cover: 0.3, base: 1400, size: [700, 1500], towers: 0.6, deck: 0, cirrus: 0.6 },
};

const CELL = 2600;        // one cloud (or none) per cell
const REACH = 9;          // cells each way round the camera
const MAX_PUFFS = 7000;
const WIND = new THREE.Vector3(7, 0, 3);   // m/s

function hashf(i, j, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SHADE = /* glsl */ `
uniform vec3 uDrift;
uniform float uNearFade;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
`;

function puffMaterial() {
  return makePs1Material({ uDrift: { value: new THREE.Vector3() }, uNearFade: { value: 1 } }, SHADE + /* glsl */ `
attribute vec2 aSpan;     // cloud base y, cloud top y
attribute float aTone;
varying vec3 vWorld;
varying float vNdl;
varying float vEdge;
varying float vUp;
varying float vTone;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  wp.xyz += uDrift;
  wp.xyz += vec3(sin(uTime * 0.15 + wp.y * 0.01), 0.0, cos(uTime * 0.12 + wp.x * 0.01)) * 6.0;
  vec3 n = normalize(mat3(m) * normal);
  vNdl = dot(n, uSunDir) * 0.5 + 0.5;
  vEdge = abs(dot(n, normalize(cameraPosition - wp.xyz)));
  vUp = clamp((wp.y - aSpan.x) / max(aSpan.y - aSpan.x, 1.0), 0.0, 1.0);
  vTone = aTone;
  vWorld = wp.xyz;
  gl_Position = psx(projectionMatrix * viewMatrix * wp);
}`, SHADE + /* glsl */ `
varying vec3 vWorld;
varying float vNdl;
varying float vEdge;
varying float vUp;
varying float vTone;
void main() {
  float b = bayer4(gl_FragCoord.xy);
  if (isShadowPass()) {
    if (b > smoothstep(0.05, 0.4, vEdge) + 0.2) discard;
    gl_FragColor = vec4(1.0);
    return;
  }
  float d = distance(vWorld, cameraPosition);
  if (b > smoothstep(40.0, 320.0, d) * uNearFade + (1.0 - uNearFade)) discard;
  if (b > smoothstep(0.02, 0.3, vEdge) + 0.12) discard;
  // Fade in and out at the edge of the cloud field, so none pop on the horizon.
  if (b > 1.0 - smoothstep(${(CELL * REACH * 0.72).toFixed(1)}, ${(CELL * REACH * 0.95).toFixed(1)}, length(vWorld.xz - cameraPosition.xz))) discard;
  float lit = vNdl * (0.55 + 0.45 * smoothstep(0.0, 0.5, vUp));
  float q = floor(lit * 4.0 + b * 0.9) / 4.0;
  vec3 shade = uAmbient * 0.75 + uSkyTop * 0.2;
  vec3 sun = vec3(0.92) * 0.5 + uSunColor * uSunStrength * 0.55;
  vec3 c = mix(shade, sun, q) * vTone;
  vec3 v = normalize(vWorld - cameraPosition);
  float rim = pow(1.0 - vEdge, 3.0) * pow(max(dot(v, uSunDir), 0.0), 3.0);
  c += uSunColor * uSunStrength * rim * 0.9;
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`);
}

function deckMaterial() {
  return makePs1Material({ uDrift: { value: new THREE.Vector3() }, uTop: { value: 1200 }, uAmount: { value: 0 }, uCenter: { value: new THREE.Vector2() } }, NOISE_GLSL + /* glsl */ `
uniform vec3 uDrift;
uniform float uTop;
uniform vec2 uCenter;
varying vec3 vWorld;
void main() {
  vWorld = vec3(uCenter.x + position.x, uTop, uCenter.y + position.z);
  gl_Position = psx(projectionMatrix * viewMatrix * vec4(vWorld, 1.0));
}`, NOISE_GLSL + /* glsl */ `
uniform vec3 uDrift;
uniform float uAmount;
uniform vec3 uSkyTop;
varying vec3 vWorld;
float deck(vec2 p) { return n_fbm(p / 2600.0, 3, 101.0) * 0.7 + n_value(p / 420.0, 107.0) * 0.3; }
void main() {
  float b = bayer4(gl_FragCoord.xy);
  vec2 p = vWorld.xz - uDrift.xz;
  float n = deck(p);
  float hole = 0.52 - uAmount * 0.2;
  if (n < hole + (b - 0.5) * 0.06) discard;
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  float e = 60.0;
  vec3 nn = normalize(vec3(deck(p - vec2(e, 0.0)) - deck(p + vec2(e, 0.0)), 0.18, deck(p - vec2(0.0, e)) - deck(p + vec2(0.0, e))));
  float below = step(cameraPosition.y, vWorld.y);
  float lit = mix(dot(nn, uSunDir) * 0.5 + 0.5, 0.25, below) * smoothstep(hole, hole + 0.12, n);
  float q = floor(lit * 4.0 + b * 0.9) / 4.0;
  vec3 shade = uAmbient * 0.7 + uSkyTop * 0.2;
  vec3 sun = vec3(0.92) * 0.5 + uSunColor * uSunStrength * 0.55;
  vec3 c = mix(shade, sun, q);
  float d = distance(vWorld, cameraPosition);
  if (b > smoothstep(20.0, 260.0, d)) discard;
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`, { side: THREE.DoubleSide });
}

function cirrusMaterial() {
  return makePs1Material({ uDrift: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uCenter: { value: new THREE.Vector2() } }, /* glsl */ `
uniform vec2 uCenter;
varying vec3 vWorld;
void main() {
  vWorld = vec3(uCenter.x + position.x, 7800.0, uCenter.y + position.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`, NOISE_GLSL + /* glsl */ `
uniform vec3 uDrift;
uniform float uAmount;
uniform vec3 uSkyHorizon;
varying vec3 vWorld;
void main() {
  if (isShadowPass()) discard;
  float b = bayer4(gl_FragCoord.xy);
  vec2 p = vWorld.xz - uDrift.xz * 3.0;
  vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * p;
  float n = n_fbm(q / vec2(9000.0, 1400.0), 4, 113.0) * smoothstep(0.3, 0.7, n_value(p / 16000.0, 127.0));
  float a = smoothstep(0.34, 0.68, n) * uAmount * 0.55;
  float far = 1.0 - smoothstep(18000.0, 32000.0, length(vWorld.xz - cameraPosition.xz));
  // Real (PS1-style stepped) translucency: thin streaks, not screen-door dots.
  a = floor(a * far * 6.0 + b) / 6.0;
  if (a <= 0.0) discard;
  vec3 c = mix(uSkyHorizon, vec3(1.0), 0.45) * (0.8 + 0.3 * uSunColor * uSunStrength);
  gl_FragColor = vec4(c, a);
}`, { side: THREE.DoubleSide, depthWrite: false, transparent: true });
}

export class Clouds {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.drift = new THREE.Vector3();
    const geo = new THREE.IcosahedronGeometry(1, 1);
    geo.setAttribute('aSpan', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 2), 2));
    geo.setAttribute('aTone', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS), 1));
    this.puffs = new THREE.InstancedMesh(geo, puffMaterial(), MAX_PUFFS);
    this.puffs.frustumCulled = false;
    this.puffs.count = 0;
    // Subdivided, so no vertex is ever far behind the camera (huge single
    // triangles made the deck and cirrus jitter where they met the hills).
    const plane = new THREE.PlaneGeometry(70000, 70000, 48, 48).rotateX(-Math.PI / 2);
    this.deck = new THREE.Mesh(plane, deckMaterial());
    this.cirrus = new THREE.Mesh(plane, cirrusMaterial());
    for (const m of [this.puffs, this.deck, this.cirrus]) { m.frustumCulled = false; this.group.add(m); }
    this.cell = [1e9, 1e9];
    this.list = [];   // clouds near the camera: { x, z, y0, y1, r, puffs: [[x, y, z, sx, sy]] } in cloud space
    this.weather = WEATHER.scattered;
    this.seed = 1;
    this.inside = 0;
  }

  setWeather(name, seed = 1) {
    this.weather = WEATHER[name] || WEATHER.scattered;
    this.seed = seed;
    this.cell = [1e9, 1e9];
    this.deck.visible = this.weather.deck > 0;
    this.deck.material.uniforms.uTop.value = this.weather.deck;
    this.deck.material.uniforms.uAmount.value = 1;
    this.cirrus.material.uniforms.uAmount.value = this.weather.cirrus;
  }

  // One cloud for a cell (or null), from the cell's hash.
  cloudAt(ci, cj) {
    const w = this.weather, s = this.seed;
    if (hashf(ci, cj, s) > w.cover) return null;
    const x = (ci + 0.2 + 0.6 * hashf(ci, cj, s + 1)) * CELL, z = (cj + 0.2 + 0.6 * hashf(ci, cj, s + 2)) * CELL;
    const width = w.size[0] + (w.size[1] - w.size[0]) * hashf(ci, cj, s + 3);
    const tower = hashf(ci, cj, s + 4) < w.towers;
    // Bases sit clear of the hills under them (clouds cutting into a slope
    // flickered where the two surfaces met).
    const ground = Math.max(0, heightAt(x, z), heightAt(x + width * 0.4, z), heightAt(x - width * 0.4, z), heightAt(x, z + width * 0.4), heightAt(x, z - width * 0.4));
    const y0 = Math.max(w.base + (hashf(ci, cj, s + 5) - 0.5) * 300 - (w.deck ? 150 : 0), ground + 300);
    const tall = width * (tower ? 1.4 + hashf(ci, cj, s + 6) * 2.2 : 0.35 + hashf(ci, cj, s + 6) * 0.45);
    const puffs = [];
    let k = 0;
    const rnd = () => hashf(ci, cj, s + 10 + k++);
    // Flattened base layer, then smaller lobes stacked up the middle.
    const nb = 6 + Math.floor(rnd() * 5);
    for (let i = 0; i < nb; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * width * 0.45, sz = width * (0.22 + rnd() * 0.16);
      puffs.push([x + Math.cos(a) * r, y0 + sz * 0.45, z + Math.sin(a) * r * 0.8, sz * 1.25, sz * 0.5]);
    }
    // Lobes up the middle, overlapping so a tall tower reads as one column.
    const levels = Math.max(3, Math.ceil(tall / (width * 0.2)));
    for (let l = 1; l <= levels; l++) {
      const f = l / levels, spread = width * 0.4 * (1 - f * (tower ? 0.35 : 0.65)), n = tower ? 3 + (l % 2) : Math.max(2, Math.round(6 * (1 - f * 0.5)));
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283, r = Math.sqrt(rnd()) * spread, sz = width * (0.2 + rnd() * 0.14) * (1 - f * 0.35) * (tower ? 1.2 : 1);
        puffs.push([x + Math.cos(a) * r, y0 + tall * f * 0.85 + sz * 0.2, z + Math.sin(a) * r, sz, sz * (tower ? 1 : 0.85)]);
      }
    }
    // Anvil on the tallest towers.
    if (tower && tall > width * 2.6) {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.283 + rnd(), r = width * (0.35 + rnd() * 0.4), sz = width * 0.35;
        puffs.push([x + Math.cos(a) * r, y0 + tall + sz * 0.1, z + Math.sin(a) * r, sz * 1.4, sz * 0.3]);
      }
    }
    return { x, z, y0, y1: y0 + tall + width * 0.3, r: width * 0.8 + 200, puffs };
  }

  rebuild(ci, cj) {
    this.cell = [ci, cj];
    this.list = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const span = this.puffs.geometry.attributes.aSpan, tone = this.puffs.geometry.attributes.aTone;
    let n = 0;
    for (let j = -REACH; j <= REACH; j++) for (let i = -REACH; i <= REACH; i++) {
      if (i * i + j * j > REACH * REACH) continue;
      const c = this.cloudAt(ci + i, cj + j);
      if (!c) continue;
      this.list.push(c);
      for (const [x, y, z, sx, sy] of c.puffs) {
        if (n >= MAX_PUFFS) break;
        q.setFromAxisAngle(p.set(0, 1, 0), (x * 0.013 + z * 0.007) % 6.283);
        this.puffs.setMatrixAt(n, m.compose(p.set(x, y, z), q, s.set(sx, sy, sx * 0.9)));
        span.setXY(n, c.y0, c.y1);
        tone.setX(n, 0.9 + ((x * 0.37 + z * 0.11) % 1 + 1) % 1 * 0.14);
        n++;
      }
    }
    this.puffs.count = n;
    this.puffs.instanceMatrix.needsUpdate = true;
    span.needsUpdate = tone.needsUpdate = true;
  }

  // How deep inside a cloud a point is: 0 outside, 1 well inside.
  densityAt(p) {
    const x = p.x - this.drift.x, z = p.z - this.drift.z;
    let best = 0;
    for (const c of this.list) {
      if (Math.abs(x - c.x) > c.r || Math.abs(z - c.z) > c.r || p.y < c.y0 - 50 || p.y > c.y1) continue;
      for (const [px, py, pz, sx, sy] of c.puffs) {
        const dx = (x - px) / sx, dy = (p.y - py) / sy, dz = (z - pz) / (sx * 0.9);
        const d = dx * dx + dy * dy + dz * dz;
        if (d < 1) best = Math.max(best, 1 - d);
      }
    }
    const w = this.weather;
    if (w.deck && p.y < w.deck && p.y > w.deck - 260) best = Math.max(best, 0.6 * Math.min(1, (w.deck - p.y) / 60));
    return best;
  }

  update(dt, camPos) {
    this.drift.addScaledVector(WIND, dt);
    for (const m of [this.puffs, this.deck, this.cirrus]) m.material.uniforms.uDrift.value.copy(this.drift);
    this.deck.material.uniforms.uCenter.value.set(Math.round(camPos.x / 500) * 500, Math.round(camPos.z / 500) * 500);
    this.cirrus.material.uniforms.uCenter.value.set(Math.round(camPos.x / 500) * 500, Math.round(camPos.z / 500) * 500);
    const ci = Math.floor((camPos.x - this.drift.x) / CELL), cj = Math.floor((camPos.z - this.drift.z) / CELL);
    if (ci !== this.cell[0] || cj !== this.cell[1]) this.rebuild(ci, cj);
    // Inside a cloud: a soft whiteout (main.js mixes it in).
    const d = this.densityAt(camPos);
    this.inside += (d - this.inside) * Math.min(1, dt * 4);
  }
}

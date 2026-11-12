// A low-poly modern fighter (delta wing, twin canted fins, bubble canopy,
// twin nozzles), about 17 m long, nose along +Z, up +Y. Flat-shaded faces
// carry a part kind the shader colours: 0 paint, 1 belly, 2 canopy glass,
// 3 nozzle, 4 afterburner glow.
//
// The material is the PS1 kit's: vertex snapping, light in a few dithered
// steps, the shared fog and the cloud shadows. Instanced (one draw for every
// jet, paint from instanceColor, afterburner in aBurn) or single (uPaint).

import * as THREE from './vendor/three.module.js';
import { makePs1Material } from './ps1/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function builder() {
  const pos = [], nrm = [], kind = [];
  // ref: a point inside the part (faces point away from it) or { dir } (faces
  // point along dir).
  const tri = (a, b, c, k, ref) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-10) return;
    n.normalize();
    const out = ref.dir || a.clone().add(b).add(c).divideScalar(3).sub(ref);
    if (n.dot(out) < 0) { [b, c] = [c, b]; n.negate(); }
    for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); kind.push(k); }
  };
  // Quads between loops of points (same length), optionally closed, with end
  // caps. k: kind, or (side index, a, b) => kind (-1 for caps). ref: as for
  // tri, or (side index) => ref.
  const loft = (loops, k, ref, { closed = true, caps = true } = {}) => {
    const K = (i, a, b) => (typeof k === 'function' ? k(i, a, b) : k);
    const Rf = i => (typeof ref === 'function' ? ref(i) : ref);
    for (let s = 0; s < loops.length - 1; s++) {
      const A = loops[s], B = loops[s + 1], n = A.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const j = (i + 1) % n, kk = K(i, A[i], A[j]), r = Rf(i);
        tri(A[i], B[i], B[j], kk, r);
        tri(A[i], B[j], A[j], kk, r);
      }
    }
    if (!caps) return;
    loops.forEach((L, li) => {
      if (li !== 0 && li !== loops.length - 1) return;
      const c = L.reduce((s, p) => s.add(p), V(0, 0, 0)).divideScalar(L.length);
      const inner = loops[li === 0 ? 1 : loops.length - 2];
      const ci = inner.reduce((s, p) => s.add(p), V(0, 0, 0)).divideScalar(inner.length);
      const dir = c.clone().sub(ci);
      for (let i = 1; i < L.length - 1; i++) tri(L[0], L[i], L[i + 1], K(-1, L[0], L[i]), { dir });
    });
  };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    return g;
  };
  return { tri, loft, geometry };
}

const ring = (z, w, h, y, n = 8, half = false) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = half ? Math.PI * i / (n - 1) : Math.PI * 2 * i / n + Math.PI / n;
    out.push(V(Math.cos(a) * w, y + Math.sin(a) * h, z));
  }
  return out;
};

// A thin wing-like panel: root and tip chords (leading/trailing edge points)
// with a diamond section of thickness t at the root, tt at the tip.
function panel(b, rootLE, rootTE, tipLE, tipTE, t, tt, up) {
  const sec = (le, te, th) => {
    const mid = le.clone().lerp(te, 0.4);
    return [le, mid.clone().addScaledVector(up, th), te, mid.clone().addScaledVector(up, -th)];
  };
  const r = sec(rootLE, rootTE, t), s = sec(tipLE, tipTE, tt);
  const down = up.clone().negate();
  b.loft([r, s], i => (i === 0 || i === 1 ? 0 : 1), i => (i === 0 || i === 1 ? { dir: up } : { dir: down }));
}

export function buildJetGeometry() {
  const b = builder();
  // Fuselage: octagon sections from tail to nose; lower sides are belly.
  const secs = [
    [-7.8, 0.95, 0.6, 0], [-6, 1.05, 0.7, 0], [-3, 1.15, 0.8, 0], [0, 1.15, 0.85, 0.05],
    [3, 1.0, 0.85, 0.1], [5.5, 0.72, 0.68, 0.05], [7.6, 0.34, 0.34, 0], [8.7, 0.05, 0.05, 0],
  ].map(([z, w, h, y]) => ring(z, w, h, y));
  b.loft(secs, (i, a, c) => (i < 0 ? 3 : (a.y + c.y) / 2 < -0.15 ? 1 : 0), V(0, 0, 0), { caps: true });
  // Canopy: a half-octagon bubble on the spine.
  const can = [[5.6, 0.06, 0.06], [4.6, 0.45, 0.42], [3.0, 0.5, 0.5], [1.6, 0.32, 0.32], [0.8, 0.06, 0.06]]
    .map(([z, w, h]) => ring(z, w, h, 0.72, 6, true));
  b.loft(can, 2, V(0, 0.6, 3), { closed: false, caps: false });
  // Wings and tailplanes (mirrored).
  for (const sx of [1, -1]) {
    panel(b, V(sx * 1.0, -0.1, 2.4), V(sx * 1.0, -0.1, -5.6), V(sx * 5.7, -0.15, -4.5), V(sx * 5.7, -0.15, -5.6), 0.2, 0.05, V(0, 1, 0));
    panel(b, V(sx * 0.9, 0, -5.4), V(sx * 0.9, 0, -8.1), V(sx * 3.5, 0, -7.4), V(sx * 3.5, 0, -8.3), 0.1, 0.03, V(0, 1, 0));
    // Fins, canted outward.
    const cant = sx * Math.tan(THREE.MathUtils.degToRad(18)) * 3.1;
    const side = V(sx, -Math.tan(THREE.MathUtils.degToRad(18)) * sx * sx, 0).normalize();
    panel(b, V(sx * 0.85, 0.65, -3.9), V(sx * 0.85, 0.65, -7.8), V(sx * 0.85 + cant, 3.7, -6.7), V(sx * 0.85 + cant, 3.7, -8.0), 0.09, 0.03, side);
    // Intake: a box along the lower side.
    const box = [[3.4, 0.25], [0.5, 0.4], [-2.5, 0.35]].map(([z, h]) => [
      V(sx * 0.75, -0.25, z), V(sx * 1.45, -0.25, z), V(sx * 1.45, -0.25 - h * 1.6, z), V(sx * 0.75, -0.25 - h * 1.6, z)]);
    b.loft(box, 1, V(sx * 1.1, -0.6, 0.5));
    // Nozzle and its glow.
    const nz = [ring(-7.7, 0.45, 0.45, -0.05), ring(-8.7, 0.4, 0.4, -0.05)].map(L => L.map(p => p.setX(p.x + sx * 0.48)));
    b.loft(nz, 3, V(sx * 0.48, -0.05, -8.2), { caps: false });
    const g = nz[1], c = V(sx * 0.48, -0.05, -8.55);
    for (let i = 0; i < g.length; i++) b.tri(g[i], g[(i + 1) % g.length], c, 4, { dir: V(0, 0, -1) });
  }
  const geo = b.geometry();
  geo.computeBoundingSphere();
  return geo;
}

const JET_VS = /* glsl */ `
attribute float aKind;
#ifdef USE_INSTANCING
attribute float aBurn;
#endif
uniform vec3 uPaint;
uniform float uBurnOne;
varying vec3 vWorld;
varying vec3 vN;
varying float vKind;
varying vec3 vPaint;
varying float vBurn;
void main() {
  mat4 m = modelMatrix;
  vPaint = uPaint;
  vBurn = uBurnOne;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  vBurn = aBurn;
#endif
#ifdef USE_INSTANCING_COLOR
  vPaint = instanceColor;
#endif
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vKind = aKind;
  vWorld = wp.xyz;
  gl_Position = psx(projectionMatrix * viewMatrix * wp);
}`;

const JET_FS = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying float vKind;
varying vec3 vPaint;
varying float vBurn;
void main() {
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  vec3 n = normalize(vN);
  float b = bayer4(gl_FragCoord.xy);
  float sh = mix(1.0 - uShadowDark, 1.0, shadowAt(vWorld + n * 2.0));
  float ndl = max(dot(n, uSunDir), 0.0) * sh;
  float q = floor((ndl * 0.8 + 0.2) * 4.0 + b * 0.9) / 4.0;
  vec3 v = normalize(cameraPosition - vWorld);
  float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 24.0) * sh;
  vec3 base = vPaint;
  int k = int(vKind + 0.5);
  if (k == 1) base = mix(vPaint, vec3(0.72, 0.74, 0.78), 0.65);
  if (k == 2) base = vec3(0.06, 0.08, 0.12);
  if (k == 3) base = vec3(0.16, 0.15, 0.15);
  vec3 c = base * (uAmbient * 0.8 + uSunColor * uSunStrength * q);
  c += uSunColor * uSunStrength * step(b * 0.6 + 0.35, spec) * (k == 2 ? 0.9 : 0.35);
  if (k == 4) c = mix(vec3(0.35, 0.18, 0.1), mix(vec3(1.0, 0.55, 0.2), vec3(0.75, 0.85, 1.0), vBurn), 0.35 + 0.65 * vBurn);
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`;

export function makeJetMaterial(paint = new THREE.Color(0.5, 0.55, 0.6)) {
  return makePs1Material({ uPaint: { value: paint }, uBurnOne: { value: 0 } }, JET_VS, JET_FS);
}

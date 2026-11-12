// Shared with TechyBen/playtreeone (src/materials.js); keep the two in step.
// Shaders. All materials share one uniform set `U` so the GUI can change
// fog / light / PS1 settings in one place.
//
// PS1 look, by part:
//  - vertex snapping to the low-res pixel grid (psx())
//  - optional affine texture mapping (uv * w / w trick)
//  - colours come from a palette ramp texture (CLUT) indexed by tone + light,
//    with ordered dithering between ramp steps
//  - alpha-tested cutouts only, nearest filtering everywhere
//
// uPass: 0 = main view, 1 = shadow depth, 2 = impostor bake.

import * as THREE from '../vendor/three.module.js';

export const RAMP_ROWS = ['leaf', 'leaf2', 'accent', 'bark', 'ground'];

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;
export const DUMMY_TEX = white;

export const U = {
  uRes: { value: new THREE.Vector2(320, 240) },
  uSnap: { value: 1 },
  uAffine: { value: 1 },
  uPass: { value: 0 },
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSunStrength: { value: 1 },
  uAmbient: { value: new THREE.Color(0.5, 0.5, 0.6) },
  uSkyTop: { value: new THREE.Color() },
  uSkyHorizon: { value: new THREE.Color() },
  uFogColor: { value: new THREE.Color(0.7, 0.7, 0.8) },
  uFogDensity: { value: 0.03 },
  uFogBase: { value: 2 },
  uFogFalloff: { value: 0.08 },
  uFogNoise: { value: 0.3 },
  uShadowMap: { value: white },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 1 },
  uShadowBias: { value: 0.002 },
  uShadowDark: { value: 0.55 },
  uRamp: { value: white },
  uRampSteps: { value: 6 },
  uRampDither: { value: 0.8 },
  uAccentChance: { value: 0 },
  uWind: { value: 1 },
  uWindDir: { value: new THREE.Vector2(0.9, -0.42) }, // unit xz the wind blows toward
};

const COMMON = /* glsl */ `
uniform vec2 uRes;
uniform float uSnap;
uniform float uAffine;
uniform float uPass;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogBase;
uniform float uFogFalloff;
uniform float uFogNoise;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowBias;
uniform float uShadowDark;
uniform sampler2D uRamp;
uniform float uRampSteps;
uniform float uRampDither;
uniform float uAccentChance;
uniform float uWind;
uniform vec2 uWindDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
bool isShadowPass() { return abs(uPass - 1.0) < 0.5; }

// 1 = lit, 0 = in shadow. Single nearest tap: chunky, PS1-friendly.
float shadowAt(vec3 wp) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(wp, 1.0);
  vec3 s = sc.xyz / sc.w;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  return s.z - uShadowBias > texture2D(uShadowMap, s.xy).r ? 0.0 : 1.0;
}
`;

const VERT = /* glsl */ `
// Wind, shared by branches, leaves and billboards so they move together and
// LOD switches don't pop. Gust waves drift across the forest along uWindDir;
// each tree bends from the root (offset grows with height squared) with its
// own gentle oscillation and a little cross-wind wobble. Off while baking.
vec3 windSway(vec3 base, float h) {
  if (uPass > 1.5 || uWind <= 0.0) return vec3(0.0);
  vec2 d = uWindDir;
  vec2 q = base.xz * 0.035 - d * uTime * 0.12;
  float gust = vnoise(q) * 0.75 + vnoise(q * 2.3 + 7.0) * 0.25;
  float phase = hash12(floor(base.xz * 2.0)) * 6.2831;
  float bend = pow(clamp(h / 14.0, 0.0, 1.5), 2.0);
  float along = gust * (0.75 + 0.25 * sin(uTime * 1.3 + phase));
  float across = 0.25 * gust * sin(uTime * 0.9 + phase * 1.7);
  vec2 off = (d * along + vec2(-d.y, d.x) * across) * uWind * 0.45 * bend;
  return vec3(off.x, 0.0, off.y);
}
// Snap clip-space xy to the low-res pixel grid (uSnap = grid size in pixels).
vec4 psx(vec4 clip) {
  // (fightskyone: vertices near or behind the eye are left unsnapped; on huge
  // triangles snapping them made whole surfaces jump.)
  if (uPass > 0.5 || uSnap <= 0.0 || clip.w < 1.0) return clip;
  vec2 grid = uRes * 0.5 / uSnap;
  vec3 ndc = clip.xyz / clip.w;
  ndc.xy = floor(ndc.xy * grid + 0.5) / grid;
  return vec4(ndc * clip.w, clip.w);
}
`;

const FRAG = /* glsl */ `
float b2(vec2 p) { return 2.0 * mod(p.x + p.y, 2.0) + p.y; }
float bayer4(vec2 fc) {
  vec2 p = mod(floor(fc), 4.0);
  return (4.0 * b2(mod(p, 2.0)) + b2(floor(p * 0.5)) + 0.5) / 16.0;
}

// Palette lookup with ordered dithering between ramp steps.
vec3 ramp(float row, float idx) {
  float n = uRampSteps;
  idx += (bayer4(gl_FragCoord.xy) - 0.5) * uRampDither / max(n - 1.0, 1.0);
  float s = floor(clamp(idx, 0.0, 1.0) * (n - 1.0) + 0.5);
  return texture2D(uRamp, vec2((s + 0.5) / n, (row + 0.5) / 5.0)).rgb;
}

vec3 lightTint(float sunT) {
  return uAmbient + uSunColor * (uSunStrength * sunT);
}

vec3 applyFog(vec3 col, vec3 wp) {
  if (uPass > 0.5) return col;
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  float hf = exp(-max(wp.y - uFogBase, 0.0) * uFogFalloff);
  float n = 1.0 + uFogNoise * (vnoise(wp.xz * 0.05 + vec2(uTime * 0.04, uTime * 0.015)) * 2.0 - 1.0);
  float f = 1.0 - exp(-dist * uFogDensity * mix(0.3, 1.0, hf) * n);
  float glow = pow(max(dot(v / max(dist, 1e-3), uSunDir), 0.0), 8.0);
  vec3 fc = uFogColor + uSunColor * glow * 0.35 * uSunStrength;
  return mix(col, fc, clamp(f, 0.0, 1.0));
}

// Dithered LOD cross-fade: near and far versions use complementary pixels.
void lodClip(float fade, float far) {
  float b = bayer4(gl_FragCoord.xy);
  if (far < 0.5) { if (b < fade) discard; }
  else { if (b >= fade) discard; }
}
`;

const INSTANCE_FADE = /* glsl */ `
#ifdef USE_INSTANCING
attribute float aFade;
#endif
`;

function mat(uniforms, vs, fs, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...uniforms },
    vertexShader: COMMON + VERT + vs,
    fragmentShader: COMMON + FRAG + fs,
    ...extra,
  });
}

export function makeBranchMaterial(barkTex) {
  return mat({ uBark: { value: barkTex } }, INSTANCE_FADE + /* glsl */ `
attribute float aAo;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vUvA;
varying float vNdl;
varying float vAo;
varying float vFade;
void main() {
  mat4 m = modelMatrix;
  vFade = 0.0;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  vFade = aFade;
#endif
  vec4 wp = m * vec4(position, 1.0);
  vec3 base = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  wp.xyz += windSway(base, wp.y - base.y);
  vec3 n = normalize(mat3(m) * normal);
  vNdl = max(dot(n, uSunDir), 0.0);
  vAo = aAo * (0.8 + 0.2 * n.y);
  vWorld = wp.xyz;
  vUv = uv;
  vec4 clip = psx(projectionMatrix * viewMatrix * wp);
  vUvA = vec3(uv * clip.w, clip.w);
  gl_Position = clip;
}`, /* glsl */ `
uniform sampler2D uBark;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vUvA;
varying float vNdl;
varying float vAo;
varying float vFade;
void main() {
  lodClip(vFade, 0.0);
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  vec2 uv = mix(vUv, vUvA.xy / vUvA.z, uAffine);
  float tone = texture2D(uBark, uv).r;
  float sunT = vNdl * shadowAt(vWorld);
  vec3 c = ramp(3.0, tone * vAo * 0.85 + sunT * 0.3) * lightTint(sunT);
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`);
}

export function makeLeafMaterial(atlasTex, rampRow) {
  return mat({
    uLeaf: { value: atlasTex },
    uLeafRow: { value: rampRow },
    uLeafShadowOffset: { value: 0.8 },
  }, INSTANCE_FADE + /* glsl */ `
attribute vec2 aCorner;
attribute vec2 aRand;
varying vec3 vWorld;
varying vec2 vUv;
varying float vNdl;
varying float vFade;
void main() {
  mat4 m = modelMatrix;
  vFade = 0.0;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  vFade = aFade;
#endif
  vec4 wc = m * vec4(position, 1.0);
  float sc = length(m[0].xyz);
  vec3 base = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  wc.xyz += windSway(base, wc.y - base.y);
  // Flutter on top of the branch sway: small and quicker, per cluster.
  float sw = sin(uTime * 2.3 + aRand.y * 6.2831 + wc.x * 0.21 + wc.z * 0.17) * uWind;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float a = aRand.x + sw * 0.05;
  vec2 c = mat2(cos(a), sin(a), -sin(a), cos(a)) * aCorner;
  vec3 wp = wc.xyz + (right * c.x + up * c.y) * sc + vec3(uWindDir.x, 0.0, uWindDir.y) * sw * 0.025 * sc;
  vec3 n = normalize(mat3(m) * normal);
  float w = dot(n, uSunDir) * 0.5 + 0.5;
  vNdl = w * w;
  vWorld = wp;
  vUv = uv;
  gl_Position = psx(projectionMatrix * viewMatrix * vec4(wp, 1.0));
}`, /* glsl */ `
uniform sampler2D uLeaf;
uniform float uLeafRow;
uniform float uLeafShadowOffset;
varying vec3 vWorld;
varying vec2 vUv;
varying float vNdl;
varying float vFade;
void main() {
  vec4 t = texture2D(uLeaf, vUv);
  if (t.a < 0.5) discard;
  lodClip(vFade, 0.0);
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  // Offset toward the sun so a card isn't shadowed by its own light-facing twin.
  float sunT = vNdl * shadowAt(vWorld + uSunDir * uLeafShadowOffset);
  float row = t.g > 0.5 ? 3.0 : (t.b < uAccentChance ? 2.0 : uLeafRow);
  vec3 c = ramp(row, t.r * 0.75 + sunT * 0.4 - 0.1) * lightTint(sunT);
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`, { side: THREE.DoubleSide });
}

// Far LOD: a Y-axis billboard showing the baked view nearest to the camera angle.
export function makeImpostorMaterial(imp) {
  return mat({
    uAtlas: { value: imp.texture },
    uViews: { value: imp.views },
    uSize: { value: new THREE.Vector2(imp.W, imp.H) },
    uMinY: { value: imp.minY },
  }, INSTANCE_FADE + /* glsl */ `
uniform float uViews;
uniform vec2 uSize;
uniform float uMinY;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFade;
void main() {
  mat4 m = modelMatrix;
  vFade = 1.0;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  vFade = aFade;
#endif
  vec3 base = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sc = length(m[0].xyz);
  vec3 toCam = cameraPosition - base;
  toCam.y = 0.0;
  vec3 dirW = normalize(toCam + vec3(1e-5, 0.0, 0.0));
  vec3 ax = normalize(m[0].xyz), az = normalize(m[2].xyz);
  float ang = atan(dot(dirW, ax), dot(dirW, az));
  float cell = mod(floor(ang / (6.2831853 / uViews) + 0.5), uViews);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), dirW));
  float h = (uMinY + position.y * uSize.y) * sc;
  vec3 wp = base + right * position.x * uSize.x * sc + vec3(0.0, h, 0.0) + windSway(base, h);
  vUv = vec2((cell + position.x + 0.5) / uViews, position.y);
  vWorld = wp;
  gl_Position = psx(projectionMatrix * viewMatrix * vec4(wp, 1.0));
}`, /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFade;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.5) discard;
  lodClip(vFade, 1.0);
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  float sh = shadowAt(vWorld + uSunDir * 1.5);
  gl_FragColor = vec4(applyFog(t.rgb * mix(uShadowDark, 1.0, sh), vWorld), 1.0);
}`, { side: THREE.DoubleSide });
}

export function makeGroundMaterial(groundTex) {
  return mat({ uGround: { value: groundTex } }, /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vUvA;
varying float vNdl;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNdl = max(dot(normalize(mat3(modelMatrix) * normal), uSunDir), 0.0);
  vWorld = wp.xyz;
  vUv = wp.xz * 0.25;
  vec4 clip = psx(projectionMatrix * viewMatrix * wp);
  vUvA = vec3(vUv * clip.w, clip.w);
  gl_Position = clip;
}`, /* glsl */ `
uniform sampler2D uGround;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vUvA;
varying float vNdl;
void main() {
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  vec2 uv = mix(vUv, vUvA.xy / vUvA.z, uAffine);
  float tone = texture2D(uGround, uv).r;
  float sunT = vNdl * shadowAt(vWorld);
  vec3 c = ramp(4.0, tone * 0.7 + sunT * 0.35 - 0.05) * lightTint(sunT);
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`);
}

export function makeSkyMaterial() {
  return mat({}, /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = clip.xyww; // depth = 1: the composite pass treats it as open sky
}`, /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(h, 0.6));
  float s = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(s, 900.0) * 1.2 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12) * uSunStrength;
  float hz = exp(-h * 7.0);
  col = mix(col, uFogColor + uSunColor * pow(s, 8.0) * 0.3 * uSunStrength, hz * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`, { side: THREE.BackSide, depthWrite: true });
}

// Floating dust motes: only visible where the shadow map says the sun reaches,
// so they sparkle inside the light shafts.
export function makeMotesMaterial() {
  return mat({ uBox: { value: 30 } }, /* glsl */ `
uniform float uBox;
attribute float aSeed;
varying float vBright;
void main() {
  vec3 c = cameraPosition;
  vec3 p = position * uBox + vec3(sin(uTime * 0.3 + aSeed * 40.0), uTime * 0.12 * (aSeed - 0.4), cos(uTime * 0.23 + aSeed * 30.0)) * 0.8;
  p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5 + c;
  float dist = length(p - c);
  float lit = shadowAt(p);
  float fwd = pow(max(dot((p - c) / max(dist, 1e-3), uSunDir), 0.0), 3.0);
  vBright = lit * (0.25 + fwd) * (1.0 - smoothstep(uBox * 0.25, uBox * 0.5, dist)) * step(1.0, dist);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = dist < 5.0 ? 2.0 : 1.0;
}`, /* glsl */ `
varying float vBright;
void main() {
  if (vBright < 0.04) discard;
  gl_FragColor = vec4(uSunColor * vBright * 0.5, 1.0);
}`, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Resample each preset ramp to `steps` entries: one row per RAMP_ROWS entry.
export function buildRampTexture(preset, steps) {
  const data = new Uint8Array(steps * RAMP_ROWS.length * 4);
  RAMP_ROWS.forEach((row, r) => {
    const stops = preset.ramps[row].map(hexToRgb);
    for (let i = 0; i < steps; i++) {
      const f = (steps === 1 ? 0 : i / (steps - 1)) * (stops.length - 1);
      const a = Math.min(Math.floor(f), stops.length - 2), k = f - a;
      const o = (r * steps + i) * 4;
      for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.round(stops[a][ch] + (stops[a + 1][ch] - stops[a][ch]) * k);
      data[o + 3] = 255;
    }
  });
  const tex = new THREE.DataTexture(data, steps, RAMP_ROWS.length);
  tex.needsUpdate = true;
  return tex;
}

export function dataTexture({ data, width, height }, repeat = false) {
  const tex = new THREE.DataTexture(data, width, height);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Eternal Plight addition (not in playtreeone): game materials (the wyvern)
// build on the same shared uniforms and shader chunks.
export { mat as makePs1Material };

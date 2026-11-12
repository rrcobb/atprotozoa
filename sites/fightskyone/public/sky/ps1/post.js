// Shared with TechyBen/playtreeone (src/post.js); keep the two in step.
// Low-res pipeline: the scene renders into a small target (with depth), then
// one composite pass adds screen-space god rays and quantises colour with
// ordered dithering. The canvas itself is low-res and CSS-upscaled with
// `image-rendering: pixelated`, so every pass works on real chunky pixels.

import * as THREE from '../vendor/three.module.js';

const FS = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSunUv;
uniform float uSunVis;
uniform float uGodray;
uniform float uDecay;
uniform vec3 uSunColor;
uniform float uNear;
uniform float uFar;
uniform float uFogDensity;
uniform float uAspect;
uniform float uBits;
uniform float uDither;
uniform float uFade;
uniform vec3 uFadeColor;
varying vec2 vUv;

float b2(vec2 p) { return 2.0 * mod(p.x + p.y, 2.0) + p.y; }
float bayer4(vec2 fc) {
  vec2 p = mod(floor(fc), 4.0);
  return (4.0 * b2(mod(p, 2.0)) + b2(floor(p * 0.5)) + 0.5) / 16.0;
}
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}
// How much sunlight gets through at this pixel: open sky fully, geometry
// partly when it is far enough to be lost in fog.
float transmit(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  if (d > 0.99999) return 1.0;
  return (1.0 - exp(-linDepth(d) * uFogDensity * 0.5)) * 0.6;
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uGodray > 0.0 && uSunVis > 0.0) {
    const int N = 40;
    vec2 delta = (uSunUv - vUv) / float(N);
    vec2 uv = vUv + delta * bayer4(gl_FragCoord.xy);
    float illum = 1.0, sum = 0.0;
    for (int i = 0; i < N; i++) {
      uv += delta;
      float m = max(0.0, 1.0 - length((uv - uSunUv) * vec2(uAspect, 1.0)) * 1.3);
      sum += transmit(clamp(uv, 0.0, 1.0)) * m * illum;
      illum *= uDecay;
    }
    col += uSunColor * (sum / float(N)) * uGodray * uSunVis;
  }
  col = mix(col, uFadeColor, uFade);
  float levels = exp2(uBits) - 1.0;
  col = floor(col * levels + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5) * uDither) / levels;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(4, 4),
    });
    this.uniforms = {
      tColor: { value: this.rt.texture },
      tDepth: { value: this.rt.depthTexture },
      uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
      uSunVis: { value: 0 },
      uGodray: { value: 0.6 },
      uDecay: { value: 0.97 },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 600 },
      uFogDensity: { value: 0.03 },
      uAspect: { value: 1 },
      uBits: { value: 5 },
      uDither: { value: 1 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FS,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
    this.uniforms.uAspect.value = w / h;
  }

  composite(camera, sunDir) {
    const u = this.uniforms;
    const p = this._v.copy(camera.position).addScaledVector(sunDir, 400).project(camera);
    u.uSunUv.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const facing = camera.getWorldDirection(this._f).dot(sunDir);
    const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(p.x), Math.abs(p.y)), 1.0, 1.8);
    u.uSunVis.value = THREE.MathUtils.smoothstep(facing, 0.0, 0.35) * edge;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }
}

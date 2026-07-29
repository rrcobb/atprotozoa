"use strict";

// Green drippy goop background — WebGL1 fullscreen shader, animated fbm noise
// stretched vertically and scrolled over time so it reads as sludge dripping
// down the screen. Falls back to a CSS animated gradient if WebGL is
// unavailable. Only ever mounted for one specific logged-in handle; see
// updateGoopBackground() in app.js.

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p *= 2.02;
    amp *= 0.55;
  }
  return v;
}
void main() {
  vec2 uv = vUv;
  vec2 p = uv * vec2(uRes.x / max(uRes.y, 1.0), 1.0) * 5.5;

  float flow = uTime * 0.22;
  vec2 dripUv = vec2(p.x * 1.1, p.y * 0.35 - flow);
  float n = fbm(dripUv);
  float n2 = fbm(dripUv * 2.4 + vec2(3.1, 7.7));

  // thin drip strands: sharpen a second, faster-flowing noise into streaks
  vec2 strandUv = vec2(p.x * 3.0, p.y * 0.15 - flow * 1.8);
  float strand = smoothstep(0.55, 0.95, fbm(strandUv));

  float goop = smoothstep(0.32, 0.7, n * 0.7 + n2 * 0.3);
  goop = max(goop, strand * 0.6);

  vec3 bgCol = vec3(0.015, 0.03, 0.015);
  vec3 slimeDark = vec3(0.03, 0.18, 0.03);
  vec3 slimeMid = vec3(0.09, 0.42, 0.08);
  vec3 slimeLight = vec3(0.35, 0.9, 0.28);

  vec3 col = mix(bgCol, slimeDark, goop);
  col = mix(col, slimeMid, smoothstep(0.55, 0.85, n2) * goop);
  float highlight = smoothstep(0.78, 0.98, n2) * goop;
  col = mix(col, slimeLight, highlight * 0.8);

  gl_FragColor = vec4(col, 1.0);
}`;

let canvas = null;
let gl = null;
let rafId = null;
let startTs = null;
let uTimeLoc = null;
let uResLoc = null;
let fallbackEl = null;
let glFailed = false;

function ensureCanvas() {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "goop-canvas";
    document.body.appendChild(canvas);
  }
  return canvas;
}

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(info || "shader compile failed");
  }
  return s;
}

function initGL() {
  gl =
    canvas.getContext("webgl", { alpha: false, antialias: false }) ||
    canvas.getContext("experimental-webgl", { alpha: false, antialias: false });
  if (!gl) return false;
  try {
    const vs = compileShader(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "program link failed");
    }
    gl.useProgram(program);
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    uTimeLoc = gl.getUniformLocation(program, "uTime");
    uResLoc = gl.getUniformLocation(program, "uRes");
    return true;
  } catch {
    gl = null;
    return false;
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.floor(window.innerWidth * dpr));
  const h = Math.max(1, Math.floor(window.innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    if (gl) gl.viewport(0, 0, w, h);
  }
}

function frame(ts) {
  if (startTs === null) startTs = ts;
  resize();
  gl.uniform1f(uTimeLoc, (ts - startTs) / 1000);
  gl.uniform2f(uResLoc, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  rafId = requestAnimationFrame(frame);
}

function startCssFallback() {
  if (fallbackEl) return;
  fallbackEl = document.createElement("div");
  fallbackEl.className = "goop-fallback";
  document.body.appendChild(fallbackEl);
}

export function startGoop() {
  ensureCanvas();
  canvas.style.display = "block";
  if (!gl && !glFailed && !initGL()) glFailed = true;
  if (!gl) {
    startCssFallback();
    return;
  }
  if (fallbackEl) {
    fallbackEl.remove();
    fallbackEl = null;
  }
  resize();
  if (!rafId) {
    startTs = null;
    rafId = requestAnimationFrame(frame);
  }
}

export function stopGoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (canvas) canvas.style.display = "none";
  if (fallbackEl) {
    fallbackEl.remove();
    fallbackEl = null;
  }
}

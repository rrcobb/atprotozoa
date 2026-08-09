"use strict";

// Green drippy goop background — WebGL1 fullscreen shader, animated fbm noise
// stretched vertically and scrolled over time so it reads as sludge dripping
// down the screen. Falls back to a CSS animated gradient if WebGL is
// unavailable. This is skyclone's default background now — everyone gets the
// gunk; see updateGoopBackground() in app.js. Runs at a low ambient intensity
// at all times, and surges to a heavy flood (see surgeGoop()) when a fresh
// notification lands, alongside a gross synthesized sound (see
// playGrossSound()).

const AMBIENT_INTENSITY = 0.16;
const SURGE_INTENSITY = 1.0;

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
uniform float uIntensity;

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

  // more sludge moves faster and thicker as uIntensity climbs during a surge
  float flow = uTime * (0.12 + 0.35 * uIntensity);
  vec2 dripUv = vec2(p.x * 1.1, p.y * 0.35 - flow);
  float n = fbm(dripUv);
  float n2 = fbm(dripUv * 2.4 + vec2(3.1, 7.7));

  // thin drip strands: sharpen a second, faster-flowing noise into streaks
  vec2 strandUv = vec2(p.x * 3.0, p.y * 0.15 - flow * 1.8);
  float strand = smoothstep(0.55, 0.95, fbm(strandUv));

  float density = 0.20 * uIntensity;
  float goop = smoothstep(0.32 - density, 0.7 - density * 0.5, n * 0.7 + n2 * 0.3);
  goop = max(goop, strand * (0.6 + 0.3 * uIntensity));

  vec3 bgCol = vec3(0.015, 0.03, 0.015);
  vec3 slimeDark = vec3(0.03, 0.18, 0.03);
  vec3 slimeMid = vec3(0.09, 0.42, 0.08);
  vec3 slimeLight = vec3(0.35, 0.9, 0.28);

  vec3 col = mix(bgCol, slimeDark, goop);
  col = mix(col, slimeMid, smoothstep(0.55, 0.85, n2) * goop);
  float highlight = smoothstep(0.78, 0.98, n2) * goop;
  col = mix(col, slimeLight, highlight * (0.8 + 0.4 * uIntensity));

  gl_FragColor = vec4(col, 1.0);
}`;

let canvas = null;
let gl = null;
let rafId = null;
let startTs = null;
let uTimeLoc = null;
let uResLoc = null;
let uIntensityLoc = null;
let fallbackEl = null;
let glFailed = false;

// Smoothly-animated intensity: snaps toward targetIntensity every frame so a
// surge ramps up fast and oozes back down slow instead of jump-cutting.
let curIntensity = AMBIENT_INTENSITY;
let targetIntensity = AMBIENT_INTENSITY;
let surgeTimer = null;

function ensureCanvas() {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "goop-canvas";
    document.body.appendChild(canvas);
  }
  return canvas;
}

function applyIntensityStyle() {
  const opacity = 0.28 + 0.62 * curIntensity;
  if (canvas) canvas.style.opacity = String(opacity);
  if (fallbackEl) {
    fallbackEl.style.opacity = String(opacity);
    fallbackEl.style.animationDuration = 6 - 4.2 * curIntensity + "s";
  }
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
    uIntensityLoc = gl.getUniformLocation(program, "uIntensity");
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
  curIntensity += (targetIntensity - curIntensity) * 0.03;
  applyIntensityStyle();
  gl.uniform1f(uTimeLoc, (ts - startTs) / 1000);
  gl.uniform2f(uResLoc, canvas.width, canvas.height);
  gl.uniform1f(uIntensityLoc, curIntensity);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  rafId = requestAnimationFrame(frame);
}

function startCssFallback() {
  if (fallbackEl) return;
  fallbackEl = document.createElement("div");
  fallbackEl.className = "goop-fallback";
  document.body.appendChild(fallbackEl);
  applyIntensityStyle();
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
  applyIntensityStyle();
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
  if (surgeTimer) {
    clearTimeout(surgeTimer);
    surgeTimer = null;
  }
  curIntensity = AMBIENT_INTENSITY;
  targetIntensity = AMBIENT_INTENSITY;
  if (canvas) canvas.style.display = "none";
  if (fallbackEl) {
    fallbackEl.remove();
    fallbackEl = null;
  }
}

// Called when a fresh notification lands: floods the screen with a heavy
// flow of sludge for `durationMs`, then eases back down to the ambient ooze.
// For the CSS fallback (no WebGL/no rAF loop driving curIntensity) this just
// jumps straight to the surge opacity/speed and back.
export function surgeGoop(durationMs) {
  targetIntensity = SURGE_INTENSITY;
  if (!rafId) {
    curIntensity = SURGE_INTENSITY;
    applyIntensityStyle();
  }
  if (surgeTimer) clearTimeout(surgeTimer);
  surgeTimer = setTimeout(() => {
    targetIntensity = AMBIENT_INTENSITY;
    if (!rafId) {
      curIntensity = AMBIENT_INTENSITY;
      applyIntensityStyle();
    }
    surgeTimer = null;
  }, durationMs || 4500);
}

// ---------- gross sound ----------
//
// Synthesized entirely with Web Audio — no audio asset to ship. A low
// pitch-dropping "glorp" oscillator layered under filtered noise gives a
// wet squelch. Browsers block audio before any user gesture on the page;
// resume() below is a no-op once that gesture has happened (e.g. the
// original OAuth login click) and just silently fails otherwise.

let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function squelchAt(ctx, dest, tOffset, pitch) {
  const dur = 0.5 + Math.random() * 0.35;
  const t0 = ctx.currentTime + tOffset;

  // filtered noise burst = wet, grainy sludge texture
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.Q.value = 0.7;
  noiseFilter.frequency.setValueAtTime(1400, t0);
  noiseFilter.frequency.exponentialRampToValueAtTime(180, t0 + dur);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t0);
  noiseGain.gain.linearRampToValueAtTime(0.5, t0 + 0.04);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  noise.connect(noiseFilter).connect(noiseGain).connect(dest);

  // low pitch-dropping "glorp" body
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(pitch, t0);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.35, t0 + dur);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, t0);
  oscGain.gain.linearRampToValueAtTime(0.4, t0 + 0.03);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(oscGain).connect(dest);

  noise.start(t0);
  noise.stop(t0 + dur + 0.05);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// count: how many gross squelches to layer/stagger — a bigger flood of
// notifications makes for a bigger, gooier flood of sound.
export function playGrossSound(count) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  const n = Math.max(1, Math.min(count || 1, 4));
  for (let i = 0; i < n; i++) {
    squelchAt(ctx, master, i * 0.18, 90 + Math.random() * 60);
  }
}

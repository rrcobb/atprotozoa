import { ridge, noise, hash } from "./lib/terrain.js";
import { step as simStep, ground as simGround, pitchFor as simPitch } from "./lib/sim.js";
import { PALETTES, mix, rgb } from "./lib/palettes.js";

const $ = (id) => document.getElementById(id);
const canvas = $("scene"), ctx = canvas.getContext("2d");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- state ---------------------------------------------------------------
const S = {
  legs: 16, speed: 0.45, rough: 0.3, mode: "climb", style: "atmos", suspension: true, gravity: 1,
  rigid: false, travel: 1, stiff: 14, tilt: 1, bodyRate: 4, ride: 0, spacing: 1, phase: "jansen", parallel: true, rail: true, cranks: true,
  running: !reduceMotion, sound: false,
  D: 0, theta: 0, time: 0,
  roughS: 0.3, modeOff: 0,
  bodyH: null, slope: 0, vx: 0, vy: 0, w: 0, ay: 0, al: 0, cam: 0, zoom: null, alt0: 0,
  near: [], far: [], particles: [],
};
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ground = (x) => simGround(S, x);
const pitchFor = (pairs) => simPitch(S, pairs);

let tickFn = null; // set by the sound module
const hooks = { touchdown };
function touchdown(x, y, side, impact) {
  if (tickFn) tickFn(side, impact);
  const a = altFrac();
  // Harder landings kick up more dust: one puff per ~40 units/s of impact.
  const puffs = clamp(Math.round(impact / 40), 0, 4);
  for (let i = 0; i < puffs && a < 0.45 && S.particles.length < 160 && S.speed > 0.02; i++) {
    x += i * 3;
    S.particles.push({ x, y: y + 2, vx: 8 + hash(Math.floor(x * 7)) * 6 + 14, vy: 10 + Math.abs(hash(Math.floor(x * 3))) * 18, life: 1 + Math.abs(hash(Math.floor(x * 5))) * 1.2, max: 2.2 });
  }
}
const altitude = () => Math.max(0, S.bodyH - S.alt0);
const altFrac = () => clamp(altitude() / 2600, 0, 1);

// ---- drawing -------------------------------------------------------------
let W = 0, H = 0, res = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  res = S.style === "retro" ? 1 / 3 : Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(W * res)); canvas.height = Math.max(1, Math.round(H * res));
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
}
addEventListener("resize", resize);

function targetZoom() {
  const pairs = S.legs / 2, len = (pairs - 1) * pitchFor(pairs) + 150;
  const z0 = clamp(W / 900, 0.55, 1.3);
  return Math.min(z0, (0.62 * W) / len, (0.5 * H) / 190);
}

function draw(legs, dt) {
  const P = PALETTES[S.style];
  const retro = S.style === "retro";
  ctx.setTransform(res, 0, 0, res, 0, 0);
  ctx.imageSmoothingEnabled = !retro;
  const zt = targetZoom();
  S.zoom = S.zoom === null ? zt : S.zoom + (zt - S.zoom) * damp(3, dt);
  const z = S.zoom;
  const ancX = W * 0.4, ancY = H * 0.6;
  const a = altFrac();
  const ca = S.cam - S.alt0; // camera height above where it started
  const sx = (wx) => ancX + (wx - S.D) * z;
  const sy = (wh) => ancY + (S.cam - wh) * z;
  const horizonY = H * 0.5 + ca * z * 0.1;
  const step = retro ? 9 : 5;

  // sky
  const sTop = mix(P.skyTop, P.skyTopHi, a), sBot = mix(P.skyBot, P.skyBotHi, a);
  if (retro) {
    const bands = 9;
    for (let i = 0; i < bands; i++) { ctx.fillStyle = rgb(mix(sTop, sBot, i / (bands - 1))); ctx.fillRect(0, (H * i) / bands, W, H / bands + 1); }
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 10));
    g.addColorStop(0, rgb(sTop)); g.addColorStop(1, rgb(sBot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (P.sun) {
      const gx = W * 0.78, gy = horizonY - H * 0.16 - a * H * 0.1;
      const r = Math.max(W, H) * 0.5, sg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      sg.addColorStop(0, "rgba(255,244,214,.75)"); sg.addColorStop(0.12, "rgba(255,230,180,.3)"); sg.addColorStop(1, "rgba(255,230,180,0)");
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    }
  }

  // distant ridgelines: [seed, parallax-x, extra sink, px above horizon, amp, detail scale]
  const LAYERS = [
    [1, 0.03, 0.0, 6, 64, 3.4], [2, 0.06, 0.03, 0, 80, 2.4],
    [3, 0.12, 0.08, -18, 100, 1.7], [4, 0.22, 0.16, -46, 120, 1.15],
  ];
  const ridgeLayer = (i) => {
    const [seed, pf, sink, up, amp, sc] = LAYERS[i];
    const base = horizonY - up * z + ca * z * sink;
    const col = mix(P.mount[i], sBot, P.haze[i] * (1 - a * 0.35) + a * 0.12);
    ctx.fillStyle = rgb(col);
    ctx.beginPath(); ctx.moveTo(0, i < 2 ? base + 3 : H);
    const A = amp * z * (1 + a * (i >= 2 ? 1.6 : 0.9));
    for (let px = 0; px <= W + step; px += step) {
      const u = S.D * pf + (px - ancX) * sc;
      ctx.lineTo(px, base - (ridge(u, seed) - 0.25) * A);
    }
    ctx.lineTo(W + step, i < 2 ? base + 3 : H); ctx.closePath(); ctx.fill();
  };
  ridgeLayer(0); ridgeLayer(1);

  // haze band at the horizon, sea below it
  if (horizonY < H) {
    const sea = mix(P.sea, sBot, 0.25);
    if (retro) { ctx.fillStyle = rgb(P.sea); ctx.fillRect(0, horizonY, W, H - horizonY); }
    else {
      const g = ctx.createLinearGradient(0, horizonY, 0, Math.min(H, horizonY + 260 * z));
      g.addColorStop(0, rgb(mix(sea, sBot, 0.5))); g.addColorStop(1, rgb(P.sea));
      ctx.fillStyle = g; ctx.fillRect(0, horizonY, W, H - horizonY);
    }
    if (P.shimmer) {
      ctx.fillStyle = "rgba(255,255,255,.22)";
      for (let i = 0; i < 26; i++) {
        const t = hash(i * 31 + 5) * 0.5 + 0.5, d = Math.pow(t, 1.6);
        const y = horizonY + 6 + d * 260 * z, wob = Math.sin(S.time * 0.8 + i) * 6;
        const x = ((hash(i * 17 + 2) * 0.5 + 0.5) * (W + 200) - S.D * 0.05 * (0.3 + d)) % (W + 200);
        ctx.fillRect(((x % (W + 200)) + W + 200) % (W + 200) - 100 + wob, y, 20 + d * 70, 1 + d * 1.5);
      }
    }
  }
  if (!retro) {
    const hg = ctx.createLinearGradient(0, horizonY - 70 * z, 0, horizonY + 10 * z);
    hg.addColorStop(0, rgb(sBot, 0)); hg.addColorStop(1, rgb(sBot, P.horizonHaze));
    ctx.fillStyle = hg; ctx.fillRect(0, horizonY - 70 * z, W, 80 * z);
  }
  ridgeLayer(2);
  drawClouds(P, z, ancX, ancY, sBot, retro, 0);
  ridgeLayer(3);

  // foreground terrain
  const rockT = clamp((a - 0.2) / 0.6, 0, 1);
  const sandTop = mix(P.sandTop, P.rockTop, rockT), sandBot = mix(P.sandBot, P.rockBot, rockT);
  ctx.beginPath(); ctx.moveTo(0, H);
  const pts = [];
  for (let px = 0; px <= W + step; px += step) {
    const gy = sy(ground(S.D + (px - ancX) / z));
    pts.push(px, gy); ctx.lineTo(px, gy);
  }
  ctx.lineTo(W + step, H); ctx.closePath();
  if (retro) ctx.fillStyle = rgb(sandTop);
  else {
    const g = ctx.createLinearGradient(0, ancY, 0, H);
    g.addColorStop(0, rgb(sandTop)); g.addColorStop(1, rgb(sandBot));
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.strokeStyle = rgb(P.groundLine); ctx.lineWidth = retro ? 2 : 1.2; ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1]);
  ctx.stroke();

  // quiet texture: faint sand strata
  if (!retro) {
    ctx.strokeStyle = rgb(P.groundLine, 0.12); ctx.lineWidth = 1;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      for (let px = 0; px <= W + step; px += step * 2) {
        const gy = sy(ground(S.D + (px - ancX) / z)) + r * 22 * z + noise((S.D + (px - ancX) / z) / 140, 40 + r) * 5;
        px ? ctx.lineTo(px, gy) : ctx.moveTo(px, gy);
      }
      ctx.stroke();
    }
  }

  // foot shadows + dust, under the machine
  for (const L of legs) {
    if (L.side) continue;
    const gh = ground(L.footX), lift = L.footH - gh;
    if (lift > 1.5) {
      ctx.fillStyle = rgb(P.groundLine, clamp(0.28 - lift / 220, 0.04, 0.28));
      ctx.beginPath(); ctx.ellipse(sx(L.footX), sy(gh) + 1, (9 + lift * 0.08) * z, 2 * z, 0, 0, 7); ctx.fill();
    }
  }
  for (const p of S.particles) {
    ctx.fillStyle = rgb(P.sandTop, clamp(p.life / p.max, 0, 1) * 0.8);
    const q = Math.max(1, 1.6 * z);
    ctx.fillRect(sx(p.x), sy(p.y), q, q);
  }

  // machine: far side, rail, near side
  const lw = clamp(1.5 * Math.sqrt(z), 1, 2.6);
  for (const L of legs) if (L.side) drawLeg(L, P.legFar, lw * 0.85, P, z, sx, sy, false);
  if (S.rail) drawRail(legs, P, z, sx, sy, lw);
  for (const L of legs) if (!L.side) drawLeg(L, P.leg, lw, P, z, sx, sy, true);

  drawClouds(P, z, ancX, ancY, sBot, retro, 1);
  if (retro) drawRetroHud(P);
  if (!retro) drawVignette();
}

function drawVignette() { /* intentionally empty: the scene stays clean */ }

function drawLeg(L, color, lw, P, z, sx, sy, near) {
  const px = sx(L.hx), py = sy(L.hipH); // screen position of the crank axis
  const pt = (p) => [px + p.x * z, py + p.y * z];
  const J = L.J;
  ctx.strokeStyle = rgb(color); ctx.lineWidth = lw; ctx.lineCap = "round";
  ctx.beginPath();
  const seg = (a, b) => { const A = pt(J[a]), B = pt(J[b]); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); };
  seg("O", "C"); seg("F", "O");
  seg("C", "J1"); seg("F", "J1"); seg("F", "J2"); seg("J1", "J2");
  seg("J2", "J3"); seg("C", "J3"); seg("J2", "J4"); seg("J3", "J4"); seg("J3", "J5"); seg("J4", "J5");
  ctx.stroke();
  // joints
  ctx.fillStyle = rgb(near ? P.joint : mix(P.joint, P.legFar, 0.5));
  const r = Math.max(1.2, 2 * Math.sqrt(z));
  for (const name of ["F", "O", "C", "J1", "J2", "J3", "J4", "J5"]) {
    const p = pt(J[name]); ctx.beginPath(); ctx.arc(p[0], p[1], name === "J5" ? r * 0.9 : name === "O" ? r * 1.25 : r, 0, 7); ctx.fill();
  }
  // crank circle
  if (near && S.cranks) { ctx.strokeStyle = rgb(color, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, 15 * z, 0, 7); ctx.stroke(); }
}

// The body rail sits above the legs, tilted with the terrain. Each near leg hangs
// from it on a vertical slide, which is how legs meet uneven ground without
// changing a single rod length.
function drawRail(legs, P, z, sx, sy, lw) {
  const near = legs.filter((l) => !l.side);
  if (!near.length) return;
  const rail = (l) => [sx(l.hx - 19), sy(l.line + 24)];
  ctx.lineCap = "round";
  ctx.strokeStyle = rgb(P.leg); ctx.lineWidth = lw * 1.15;
  const A = rail(near[0]), B = rail(near[near.length - 1]);
  const ext = 26 * z, dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
  ctx.beginPath();
  ctx.moveTo(A[0] - (dx / len) * ext, A[1] - (dy / len) * ext);
  ctx.lineTo(B[0] + (dx / len) * ext, B[1] + (dy / len) * ext);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, lw * 0.7);
  ctx.beginPath();
  for (const l of near) {
    const r = rail(l), hx = sx(l.hx - 19), hy = sy(l.hipH - 3.9); // mid-point of the F-O bracket
    ctx.moveTo(r[0], r[1]); ctx.lineTo(hx, hy);
  }
  ctx.stroke();
  ctx.fillStyle = rgb(P.joint);
  for (const l of near) { const r = rail(l); ctx.beginPath(); ctx.arc(r[0], r[1], Math.max(1.2, 2 * Math.sqrt(z)), 0, 7); ctx.fill(); }
}

const CLOUD_CELL = 1300, BANDS = 8;
function drawClouds(P, z, ancX, ancY, sBot, retro, pass) {
  // pass 0: behind the near ridge; pass 1: a thin veil in front of the machine
  for (let b = 0; b < BANDS; b++) {
    const alt = 320 + b * 380;
    for (let q = 0; q < 3; q++) {
      const depth = 0.72 + 0.28 * (q / 2); // parallax: far clouds drift slower
      if ((q === 2) !== (pass === 1)) continue;
      const c0 = Math.floor((S.D - ancX / z / depth) / CLOUD_CELL) - 1, c1 = Math.ceil((S.D + (W - ancX) / z / depth) / CLOUD_CELL) + 1;
      for (let c = c0; c <= c1; c++) {
        const hseed = c * 131 + b * 17 + q * 977;
        const present = hash(hseed) * 0.5 + 0.5;
        if (present > 0.42 - (b > 2 ? 0.05 : 0)) continue;
        const cx = (c + (hash(hseed + 1) * 0.5 + 0.5)) * CLOUD_CELL + S.time * 7;
        const cy = alt + hash(hseed + 2) * 90;
        const scx = ancX + (cx - S.D) * z * depth, scy = ancY + (S.cam - cy) * z * depth + (1 - depth) * (ancY - H * 0.5) * 0.4;
        const size = (170 + (hash(hseed + 3) * 0.5 + 0.5) * 190) * z * (0.8 + depth * 0.3);
        if (scx < -size * 2 || scx > W + size * 2 || scy < -size || scy > H + size) continue;
        const alpha = pass === 1 ? 0.16 : 0.5 + 0.2 * depth;
        const col = rgb(P.cloud, alpha);
        ctx.fillStyle = col;
        for (let i = 0; i < 6; i++) {
          const ox = (hash(hseed + 10 + i) * 0.5) * size * 1.8, oy = -Math.abs(hash(hseed + 20 + i)) * size * 0.14;
          const rx = size * (0.45 + (hash(hseed + 30 + i) * 0.5 + 0.5) * 0.4), ry = rx * 0.32;
          ctx.beginPath(); ctx.ellipse(scx + ox, scy + oy, rx, ry, 0, 0, 7); ctx.fill();
        }
      }
    }
  }
}

function drawRetroHud(P) {
  ctx.fillStyle = rgb(P.leg); ctx.font = "bold 14px ui-monospace, monospace"; ctx.textBaseline = "top";
  const t = `ALT ${String(Math.round(altitude())).padStart(5, "0")}   DST ${String(Math.round(S.D)).padStart(6, "0")}`;
  ctx.fillText(t, 12, 12);
  ctx.fillText(`LEGS ${String(S.legs).padStart(2, "0")}  SPD ${String(Math.round(S.speed * 100)).padStart(3, "0")}`, 12, 30);
}

// ---- controls ------------------------------------------------------------
const el = { legs: $("legs"), speed: $("speed"), rough: $("rough"), mode: $("mode"), style: $("style"), pause: $("pause") };
function bindRange(id, outId, fmt, apply) {
  const input = $(id), out = $(outId);
  const go = () => { apply(+input.value); out.textContent = fmt(+input.value); };
  input.addEventListener("input", go); go();
}
bindRange("legs", "legs-out", (v) => String(v), (v) => { S.legs = v; });
bindRange("speed", "speed-out", (v) => v + "%", (v) => { S.speed = v / 100; });
bindRange("rough", "rough-out", (v) => v + "%", (v) => { S.rough = v / 100; });
el.mode.addEventListener("change", () => {
  const before = ground(S.D);
  S.mode = el.mode.value;
  S.modeOff += before - ground(S.D); // keep the ground under the machine continuous; it eases away
});
function setStyle(v) {
  S.style = v; document.body.classList.remove("min", "atmos", "retro"); document.body.classList.add(v);
  $("crt").hidden = v !== "retro";
  document.documentElement.style.background = rgb(PALETTES[v].skyBot);
  resize();
}
el.style.addEventListener("change", () => setStyle(el.style.value));
// ---- vehicle tuning --------------------------------------------------------
const VEHICLE_DEFAULTS = { rigid: false, suspension: true, travel: 100, gravity: 100, stiff: 14, tilt: 100, bodyRate: 4, ride: 0, spacing: 100, phase: "jansen", parallel: true, rail: true, cranks: true };
const veh = {};
const vRange = (id, key, outId, fmt, apply) => {
  const input = $(id), out = $(outId);
  const go = () => { apply(+input.value); out.textContent = fmt(+input.value); };
  input.addEventListener("input", go); veh[key] = (v) => { input.value = v; go(); }; go();
};
const vCheck = (id, key, apply) => {
  const input = $(id);
  const go = () => { apply(input.checked); };
  input.addEventListener("change", go); veh[key] = (v) => { input.checked = v; go(); };
};
vRange("travel", "travel", "travel-out", (v) => v + "%", (v) => { S.travel = v / 100; });
vRange("gravity", "gravity", "gravity-out", (v) => v + "%", (v) => { S.gravity = v / 100; });
vRange("stiff", "stiff", "stiff-out", String, (v) => { S.stiff = v; });
vRange("tilt", "tilt", "tilt-out", (v) => v + "%", (v) => { S.tilt = v / 100; });
vRange("bodyrate", "bodyRate", "bodyrate-out", String, (v) => { S.bodyRate = v; });
vRange("ride", "ride", "ride-out", (v) => (v > 0 ? "+" : "") + v, (v) => { S.ride = v; });
vRange("spacing", "spacing", "spacing-out", (v) => v + "%", (v) => { S.spacing = v / 100; });
$("phase").addEventListener("change", (e) => { S.phase = e.target.value; });
veh.phase = (v) => { $("phase").value = v; S.phase = v; };
vCheck("parallel", "parallel", (v) => { S.parallel = v; });
vCheck("railshow", "rail", (v) => { S.rail = v; });
vCheck("cranks", "cranks", (v) => { S.cranks = v; });
vCheck("suspension", "suspension", (v) => { S.suspension = v; });
// A rigid chassis can't pitch, so the tilt controls have nothing to do; the
// suspension still works under it.
const rigidLocks = ["tilt", "parallel"];
vCheck("rigid", "rigid", (v) => {
  S.rigid = v;
  for (const id of rigidLocks) $(id).disabled = v;
});
$("vdefaults").addEventListener("click", () => { for (const k in VEHICLE_DEFAULTS) veh[k](VEHICLE_DEFAULTS[k]); });
function setRunning(v) { S.running = v; el.pause.textContent = v ? "Pause" : "Resume"; }
el.pause.addEventListener("click", () => setRunning(!S.running));
$("reset").addEventListener("click", () => {
  S.D = 0; S.theta = 0; S.modeOff = 0; S.bodyH = null; S.alt0 = 0; S.particles = []; S.near = []; S.far = []; S.time = 0;
  snapNext = true;
});
function setPanel(open) {
  $("panel").hidden = !open; $("open").hidden = open; $("open").setAttribute("aria-expanded", String(open));
  if (open) $("hide").focus({ preventScroll: true }); else $("open").focus({ preventScroll: true });
}
$("hide").addEventListener("click", () => setPanel(false));
$("open").addEventListener("click", () => setPanel(true));
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLElement && /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName) && e.key !== "h") return;
  if (e.code === "Space" && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setRunning(!S.running); }
  else if (e.key === "h" || e.key === "H") setPanel($("panel").hidden);
});
$("share").addEventListener("click", (e) => {
  e.preventDefault();
  const txt = "a strandbeest walking out of the sea, over the dunes, up into the clouds\nhttps://strandbeest.bisks.net";
  open("https://bsky.app/intent/compose?text=" + encodeURIComponent(txt), "_blank", "noopener");
});

// sound: off until asked for; a quiet tick per footfall plus a breath of wind
let audio = null;
$("sound").addEventListener("click", async () => {
  S.sound = !S.sound;
  $("sound").textContent = "Sound: " + (S.sound ? "on" : "off"); $("sound").setAttribute("aria-pressed", String(S.sound));
  if (S.sound && !audio) audio = makeAudio();
  if (audio) { if (S.sound) await audio.ctx.resume(); else await audio.ctx.suspend(); }
});
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const c = new AC(), master = c.createGain(); master.gain.value = 0.5; master.connect(c.destination);
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const wind = c.createBufferSource(); wind.buffer = buf; wind.loop = true;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 0.6;
  const wg = c.createGain(); wg.gain.value = 0.02;
  wind.connect(bp).connect(wg).connect(master); wind.start();
  let last = 0;
  tickFn = (side, impact) => {
    if (!S.sound || c.currentTime - last < 0.012) return; last = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = "square"; o.frequency.value = (side ? 520 : 680) + Math.random() * 60;
    g.gain.setValueAtTime((0.05 / Math.sqrt(S.legs / 2)) * clamp(0.3 + (impact || 0) / 150, 0.3, 1.5), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.05);
  };
  return { ctx: c, wg, bp };
}
function updateAudio() { if (audio && S.sound) { audio.wg.gain.value = 0.015 + altFrac() * 0.05; audio.bp.frequency.value = 400 + altFrac() * 500; } }

// ---- loop ----------------------------------------------------------------
let snapNext = true, last = performance.now(), readT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const legs = simStep(S, dt, snapNext, hooks); snapNext = false;
  for (const p of S.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 40 * dt; }
  S.particles = S.particles.filter((p) => p.life > 0);
  draw(legs, dt);
  updateAudio();
  readT += dt;
  if (readT > 0.15) {
    readT = 0;
    $("dist").textContent = (S.D / 1000).toFixed(2) + " km";
    $("alt").textContent = Math.round(altitude()) + " m";
  }
  requestAnimationFrame(frame);
}
setStyle("atmos");
setRunning(S.running);
if (innerWidth <= 640) setPanel(false);
requestAnimationFrame(frame);

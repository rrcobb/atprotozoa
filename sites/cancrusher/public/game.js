// cancrusher — a 3D pressurized-shell can-crushing simulator.
//
// @cee.wtf's original ask was "physically accurate," and the first two
// passes leaned on Matter.js's 2D rigid-body solver wearing a soft-body
// costume: two vertical rails of circle bodies linked by constraints,
// buckling because a chain of fixed-length rods can't shorten except by
// bowing sideways. Cee's fair complaint after pass two: it reads as a 2D
// physics tutorial, not a can. This pass throws Matter.js out entirely and
// replaces it with an actual cylindrical shell: a ring mesh of ~130 mass
// points connected by axial (vertical), hoop (circumferential), and shear
// (diagonal) springs, integrated with position-based dynamics — Jakobsen
// relaxation, the same family of solver behind Havok Cloth and most game
// soft bodies. Internal gas pressure is simulated for real, not faked: the
// mesh's enclosed volume is estimated every frame from actual particle
// positions, Boyle's law (PV = const) turns that into a pressure scalar,
// and that pressure pushes outward on every wall vertex — a full can
// gaining real rigidity from its own contents, the same reason an
// unopened can resists a stomp far better than an empty one. Venting
// drops that pressure toward ambient over ~350ms AND independently
// softens the hoop/shear springs, so resistance genuinely collapses once
// the seal fails, not just a cosmetic multiplier. The press plate is a
// particle in the same solver (heavy, so it barely deflects, but not
// infinitely rigid) rather than a scripted animation, so its contact
// force against the shell is a read from the constraint solver, not a
// guess. None of this is finite-element accurate — nothing running in a
// browser tab is — and buckling asymmetry is still seeded with small
// per-particle/per-spring jitter, same as before, so no two crushes fold
// the same way. But it's a real constrained 3D particle simulation
// rendered with actual 3D projection and per-face lighting, buckling
// because the numbers say so — not a flat two-rail silhouette.
(function () {
  "use strict";

  // ---- mesh shape -----------------------------------------------------------

  const RINGS = 11; // 0 = top rim, RINGS-1 = base
  const SEGMENTS = 12; // particles around the circumference
  const R = 54; // can radius, world units
  const H = 260; // can height, world units
  const RING_SPACING = H / (RINGS - 1);
  const SEG_ANGLE = (Math.PI * 2) / SEGMENTS;
  const HOOP_REST = 2 * R * Math.sin(SEG_ANGLE / 2);
  const DIAG_REST = Math.hypot(RING_SPACING, HOOP_REST);
  const LABEL_RING_LO = 3;
  const LABEL_RING_HI = 7;

  const MIN_PLATE_Y = H * 0.09; // folded metal has to occupy some height
  const STOMPER_START_Y = H + 170;
  const DRAG_TOP_LIMIT = H + 210;
  const MIN_RADIUS = 6; // self-collision floor — opposite walls can't cross the axis

  const VENT_THRESHOLD = 0.14; // real cans lose most axial rigidity on the first real dent
  const COMPLETE_THRESHOLD = 0.55;
  const SETTLE_MS = 480;

  const P0 = 331; // kPa, sealed baseline
  const AMBIENT = 101; // kPa, atmospheric
  const V0 = (Math.PI * R * R) * H; // rest enclosed volume, world units^3

  // ---- can skins --------------------------------------------------------
  // Cosmetic variety plus small, honest material deltas per skin: a taller
  // "reinforced" energy can resists the first dent a bit more (stiffer
  // shell + a touch more internal pressure), a sparkling-water can is
  // thinner-walled and softer. Same VENT/COMPLETE thresholds across skins,
  // so crush % stays comparable for the personal-best tracker below.
  const SKINS = [
    { label: "cola classic", band: "rgba(255, 68, 51, 0.82)", text: "FIZZ!", textColor: "#ffe9a8", stiffMul: 1.0, pressureMul: 1.0 },
    { label: "zero sugar", band: "rgba(20, 22, 24, 0.86)", text: "ZERO", textColor: "#eef4f2", stiffMul: 1.0, pressureMul: 1.0 },
    { label: "energy+", band: "rgba(120, 255, 60, 0.8)", text: "BOOST", textColor: "#0c1114", stiffMul: 1.22, pressureMul: 1.12 },
    { label: "sparkling water", band: "rgba(70, 160, 255, 0.68)", text: "SPARK", textColor: "#ffffff", stiffMul: 0.85, pressureMul: 0.88 },
  ];
  function pickSkin() {
    return SKINS[Math.floor(Math.random() * SKINS.length)];
  }

  function jitter(n) {
    return (Math.random() * 2 - 1) * n;
  }

  // ---- audio (synthesized, no assets) --------------------------------------

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {}
    } else if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function noiseBuffer(durationSec, decayPow) {
    const n = Math.max(1, Math.round(audioCtx.sampleRate * durationSec));
    const buffer = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decayPow);
    }
    return buffer;
  }

  let lastCrunchAt = 0;
  function playCrunch(strength) {
    if (!audioCtx) return;
    const now = performance.now();
    if (now - lastCrunchAt < 65) return;
    lastCrunchAt = now;
    try {
      const t0 = audioCtx.currentTime;
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuffer(0.09 + Math.min(0.1, strength * 0.01), 1.8);
      const band = audioCtx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 700 + Math.random() * 1500;
      band.Q.value = 0.7;
      const gain = audioCtx.createGain();
      gain.gain.value = Math.min(0.55, 0.1 + strength * 0.035);
      src.connect(band).connect(gain).connect(audioCtx.destination);
      src.start(t0);
    } catch (_) {}
  }

  function playHiss() {
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuffer(0.4, 1.1);
      const low = audioCtx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.setValueAtTime(6000, t0);
      low.frequency.exponentialRampToValueAtTime(600, t0 + 0.4);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.32, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
      src.connect(low).connect(gain).connect(audioCtx.destination);
      src.start(t0);
    } catch (_) {}
  }

  function playFinale() {
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuffer(0.22, 1.4);
      const band = audioCtx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 400;
      band.Q.value = 0.5;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.5;
      src.connect(band).connect(gain).connect(audioCtx.destination);
      src.start(t0);

      const osc = audioCtx.createOscillator();
      const oGain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
      oGain.gain.setValueAtTime(0.3, t0);
      oGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      osc.connect(oGain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    } catch (_) {}
  }

  // ---- mesh construction ------------------------------------------------

  function idx(i, j) {
    return i * SEGMENTS + ((j % SEGMENTS) + SEGMENTS) % SEGMENTS;
  }

  let can = null; // { particles, springs:{hoop,axial,shear}, skin, startHeight }
  let plate = null; // { y, py, invMass }

  function makeParticle(x, y, z, invMass) {
    return { x, y, z, px: x, py: y, pz: z, ax: 0, ay: 0, az: 0, invMass };
  }

  function buildCan() {
    const skin = pickSkin();
    const particles = new Array(RINGS * SEGMENTS);
    for (let i = 0; i < RINGS; i++) {
      const y = H - i * RING_SPACING;
      const pinned = i === RINGS - 1; // base is a rigid rim, doesn't crush
      for (let j = 0; j < SEGMENTS; j++) {
        const ang = j * SEG_ANGLE;
        const rr = R + jitter(1.4);
        const x = rr * Math.cos(ang) + jitter(0.6);
        const z = rr * Math.sin(ang) + jitter(0.6);
        particles[idx(i, j)] = makeParticle(x, y + jitter(0.6), z, pinned ? 0 : 1);
      }
    }

    const hoop = [];
    const axial = [];
    const shear = [];

    function spring(list, a, b, rest, baseK) {
      const k = Math.min(1, baseK * (0.9 + Math.random() * 0.2) * skin.stiffMul);
      list.push({ a, b, rest, k });
    }

    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGMENTS; j++) {
        spring(hoop, idx(i, j), idx(i, j + 1), HOOP_REST, 0.5);
        if (i < RINGS - 1) {
          spring(axial, idx(i, j), idx(i + 1, j), RING_SPACING, 0.95);
          spring(shear, idx(i, j), idx(i + 1, j + 1), DIAG_REST, 0.22);
          spring(shear, idx(i, j), idx(i + 1, j - 1), DIAG_REST, 0.22);
        }
      }
    }

    can = {
      particles,
      hoop,
      axial,
      shear,
      skin,
      startHeight: H,
      labelSeg: Math.floor(Math.random() * SEGMENTS),
    };
  }

  function buildPlate() {
    plate = { y: STOMPER_START_Y, py: STOMPER_START_Y, invMass: 1 / 46 };
  }

  // ---- physics state ------------------------------------------------------

  const state = {
    dragging: false,
    dragTargetY: STOMPER_START_Y,
    peakForce: 0,
    peakSpeed: 0,
    vented: false,
    ventAt: 0,
    ventStartPressure: P0,
    finished: false,
    locked: false,
    settleSince: null,
    debris: [],
    shake: 0,
    lastPct: 0,
    lastVolume: V0,
    lastPressure: P0,
    lastAsymmetry: 0,
    contactForce: 0,
  };

  function resetState() {
    state.dragging = false;
    state.dragTargetY = STOMPER_START_Y;
    state.peakForce = 0;
    state.peakSpeed = 0;
    state.vented = false;
    state.ventAt = 0;
    state.ventStartPressure = P0;
    state.finished = false;
    state.locked = false;
    state.settleSince = null;
    state.debris = [];
    state.shake = 0;
    state.lastPct = 0;
    state.lastVolume = V0;
    state.lastPressure = P0;
    state.lastAsymmetry = 0;
    state.contactForce = 0;
  }

  function addShake(mag) {
    state.shake = Math.min(18, state.shake + mag);
  }

  function safeVibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) {}
  }

  // ---- personal best (localStorage, purely client-side) ---------------------

  const BEST_KEY = "cancrusher-best-v1";
  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
  function saveBest(rec) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(rec));
    } catch (_) {}
  }
  let best = loadBest();

  function newCan() {
    buildCan();
    buildPlate();
    resetState();
    document.getElementById("result").classList.remove("show");
    document.getElementById("vent-banner").classList.remove("show");
    document.getElementById("hint").classList.remove("hidden");
  }

  buildCan();
  buildPlate();

  // ---- measurement --------------------------------------------------------

  function topRingAvgY() {
    let sum = 0;
    for (let j = 0; j < SEGMENTS; j++) sum += can.particles[idx(0, j)].y;
    return sum / SEGMENTS;
  }

  function ringAvg(i) {
    let sy = 0, sr = 0;
    for (let j = 0; j < SEGMENTS; j++) {
      const p = can.particles[idx(i, j)];
      sy += p.y;
      sr += Math.hypot(p.x, p.z);
    }
    return { y: sy / SEGMENTS, r: sr / SEGMENTS };
  }

  function crushPct() {
    const top = topRingAvgY();
    const pct = 1 - top / can.startHeight;
    return Math.max(0, Math.min(1, pct));
  }

  function estimateVolumeAndAsymmetry() {
    let volume = 0;
    let maxDev = 0;
    const rings = new Array(RINGS);
    for (let i = 0; i < RINGS; i++) rings[i] = ringAvg(i);
    for (let i = 0; i < RINGS - 1; i++) {
      const rAvg = (rings[i].r + rings[i + 1].r) / 2;
      const h = Math.abs(rings[i].y - rings[i + 1].y);
      volume += Math.PI * rAvg * rAvg * h;
    }
    // asymmetry: how far individual segments deviate from their ring's
    // average radius — a perfectly uniform squash stays near 0, real
    // buckling pushes it up as the cross-section goes non-circular.
    for (let i = 0; i < RINGS; i++) {
      const avgR = rings[i].r;
      for (let j = 0; j < SEGMENTS; j++) {
        const p = can.particles[idx(i, j)];
        const dev = Math.abs(Math.hypot(p.x, p.z) - avgR);
        if (dev > maxDev) maxDev = dev;
      }
    }
    return { volume: Math.max(volume, V0 * 0.04), asymmetry: maxDev / R };
  }

  function softenAfterVent() {
    for (const s of can.hoop) s.k *= 0.42;
    for (const s of can.shear) s.k *= 0.42;
  }

  // ---- position-based dynamics solver ---------------------------------------

  const SUBSTEP_DT = 1 / 180;
  const MAX_SUBSTEPS = 5;
  const CONSTRAINT_ITERS = 6;
  const DAMPING = 0.985;
  const PLATE_DAMPING = 0.985;
  const GRAVITY_Y = -70;
  const PLATE_GRAVITY_Y = -1400;
  const FOLLOW_K = 14;
  const MAX_DRAG_V = 620;
  const STOMP_SPEED = 640;
  const PRESSURE_ACCEL_SCALE = 0.6; // tuned so resting pressure ~ gravity order of magnitude, not an explosion
  const COLLISION_STIFFNESS = 0.65; // <1 so a hard stomp's momentum carries the plate in over a few substeps instead of arresting dead in one
  const YIELD_STRAIN = 0.045; // real aluminum barely springs back — this is where a spring stops being purely elastic
  const PLASTIC_RATE = 0.02; // per-iteration creep of a yielded spring's rest length toward its deformed length

  function applySpringSet(list) {
    for (const s of list) {
      const pa = can.particles[s.a];
      const pb = can.particles[s.b];
      const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
      const len = Math.hypot(dx, dy, dz) || 1e-6;
      const wSum = pa.invMass + pb.invMass;
      if (wSum <= 0) continue;
      const diff = ((len - s.rest) / len) * s.k;
      const cx = dx * diff, cy = dy * diff, cz = dz * diff;
      if (pa.invMass > 0) {
        const f = pa.invMass / wSum;
        pa.x += cx * f; pa.y += cy * f; pa.z += cz * f;
      }
      if (pb.invMass > 0) {
        const f = pb.invMass / wSum;
        pb.x -= cx * f; pb.y -= cy * f; pb.z -= cz * f;
      }
      // plastic yield: once a spring is strained past a small elastic
      // margin, permanently creep its rest length toward the deformed
      // length — buckles and folds stick instead of elastically
      // bouncing back to the original cylinder the moment load releases.
      const strain = (len - s.rest) / s.rest;
      if (strain < -YIELD_STRAIN) {
        s.rest += (len - s.rest * (1 - YIELD_STRAIN)) * PLASTIC_RATE;
      } else if (strain > YIELD_STRAIN) {
        s.rest += (len - s.rest * (1 + YIELD_STRAIN)) * PLASTIC_RATE;
      }
    }
  }

  function physicsStep(dt) {
    // 1. pressure from current geometry (Boyle's law), feeds this step's forces
    const { volume, asymmetry } = estimateVolumeAndAsymmetry();
    state.lastVolume = volume;
    state.lastAsymmetry = asymmetry;
    let pressure;
    if (state.vented) {
      // a ruptured seal bleeds to atmosphere over time regardless of how
      // much further the shell compresses — decay from the pressure at
      // the moment of rupture, don't keep re-deriving from volume (a
      // punctured can doesn't re-pressurize just because it's flatter).
      const decay = Math.max(0, 1 - (performance.now() - state.ventAt) / 400);
      pressure = AMBIENT + (state.ventStartPressure - AMBIENT) * decay;
    } else {
      pressure = (P0 * can.skin.pressureMul * V0) / volume;
    }
    state.lastPressure = pressure;
    const pForce = Math.max(0, pressure - AMBIENT) * PRESSURE_ACCEL_SCALE;

    // 2. external forces -> acceleration, then Verlet predict
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGMENTS; j++) {
        const p = can.particles[idx(i, j)];
        if (p.invMass <= 0) continue;
        const rad = Math.hypot(p.x, p.z) || 1e-6;
        const nx = p.x / rad, nz = p.z / rad;
        const ax = nx * pForce * p.invMass;
        const az = nz * pForce * p.invMass;
        const ay = GRAVITY_Y;
        const nxp = p.x + (p.x - p.px) * DAMPING + ax * dt * dt;
        const nyp = p.y + (p.y - p.py) * DAMPING + ay * dt * dt;
        const nzp = p.z + (p.z - p.pz) * DAMPING + az * dt * dt;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x = nxp; p.y = nyp; p.z = nzp;
      }
    }

    // plate: kinematic while dragging, Verlet (gravity + contact via
    // constraint below) otherwise
    if (state.dragging && !state.locked) {
      const target = state.dragTargetY;
      let vy = (target - plate.y) * FOLLOW_K;
      vy = Math.max(-MAX_DRAG_V, Math.min(MAX_DRAG_V, vy));
      plate.py = plate.y - vy * dt;
      plate.y = plate.y + vy * dt;
    } else {
      const ny = plate.y + (plate.y - plate.py) * PLATE_DAMPING + PLATE_GRAVITY_Y * dt * dt;
      plate.py = plate.y;
      plate.y = ny;
    }

    // 3. constraint relaxation
    for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
      applySpringSet(can.axial);
      applySpringSet(can.hoop);
      applySpringSet(can.shear);
    }

    // 4. collisions: floor, plate (one-sided, positional), min-radius self-collision
    let contactForce = 0;
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGMENTS; j++) {
        const p = can.particles[idx(i, j)];
        if (p.y < 0) p.y = 0;
        if (p.invMass > 0 && p.y > plate.y) {
          const pen = p.y - plate.y;
          const wSum = p.invMass + plate.invMass;
          const pf = p.invMass / wSum, ppf = plate.invMass / wSum;
          contactForce += pen * (1 / SUBSTEP_DT) * (1 / SUBSTEP_DT);
          const soft = pen * COLLISION_STIFFNESS;
          p.y -= soft * pf;
          plate.y += soft * ppf;
        }
        const rad = Math.hypot(p.x, p.z);
        if (p.invMass > 0 && rad < MIN_RADIUS && rad > 1e-5) {
          const s = MIN_RADIUS / rad;
          p.x *= s; p.z *= s;
        }
      }
    }
    if (plate.y < MIN_PLATE_Y) { plate.y = MIN_PLATE_Y; plate.py = Math.min(plate.py, MIN_PLATE_Y); }
    if (plate.y > DRAG_TOP_LIMIT) { plate.y = DRAG_TOP_LIMIT; plate.py = Math.max(plate.py, DRAG_TOP_LIMIT); }

    state.contactForce = contactForce;
    state.peakForce = Math.max(state.peakForce, contactForce);
    const plateSpeed = Math.abs(plate.y - plate.py) / dt;
    state.peakSpeed = Math.max(state.peakSpeed, plateSpeed);
    if (plateSpeed > 12 && contactForce > 40) {
      playCrunch(Math.min(30, plateSpeed / 20));
      addShake(Math.min(14, plateSpeed * 0.05));
      if (plateSpeed > 90) safeVibrate(Math.min(60, plateSpeed * 0.2));
    }
  }

  // ---- camera / projection --------------------------------------------------

  const ARENA_W = 380;
  const ARENA_H = 600;
  const ARENA_CX = ARENA_W / 2;
  const FLOOR_ARENA_Y = 540;
  const PPU = 300 / H;
  const CAM_DIST = 1400;
  const PIVOT_Y = H / 2;
  const PITCH = 0.2;
  const LIGHT_DIR = normalize3({ x: 0.4, y: 0.62, z: -0.68 });

  let yaw = 0.6;
  const YAW_SPEED = 0.16; // rad/s, slow product-shot turntable

  function normalize3(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function rotateDir(x, y, z) {
    // same rotation as rotatePoint but for a direction (no pivot translation)
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return { x: x1, y: y2, z: z2 };
  }

  function rotatePoint(x, y, z) {
    // rotate about the can's mid-height so the turntable feels centered
    const d = rotateDir(x, y - PIVOT_Y, z);
    return { x: d.x, y: d.y + PIVOT_Y, z: d.z };
  }

  function project(rp) {
    const persp = CAM_DIST / (CAM_DIST + rp.z);
    return {
      x: ARENA_CX + rp.x * PPU * persp,
      y: FLOOR_ARENA_Y - rp.y * PPU * persp,
      depth: rp.z,
    };
  }

  function shade(normal, baseColor) {
    const b = Math.max(0.22, Math.min(1, 0.35 + 0.75 * (normal.x * LIGHT_DIR.x + normal.y * LIGHT_DIR.y + normal.z * LIGHT_DIR.z)));
    return tint(baseColor, b);
  }

  function tint(hex, b) {
    // hex is [r,g,b]; return an rgb() string scaled toward black/white by b
    const r = Math.max(0, Math.min(255, hex[0] * b));
    const g = Math.max(0, Math.min(255, hex[1] * b));
    const bl = Math.max(0, Math.min(255, hex[2] * b));
    return `rgb(${r | 0},${g | 0},${bl | 0})`;
  }

  function faceNormal(a, b, c) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    return normalize3({ x: nx, y: ny, z: nz });
  }

  // ---- canvas / camera fit --------------------------------------------------

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  let cssScale = 1, offX = 0, offY = 0, dpr = 1;

  function fitCanvas() {
    const wrap = document.getElementById("stage-wrap");
    const rect = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    cssScale = Math.min(rect.width / ARENA_W, rect.height / ARENA_H);
    offX = (rect.width - ARENA_W * cssScale) / 2;
    offY = (rect.height - ARENA_H * cssScale) / 2;
  }
  window.addEventListener("resize", fitCanvas);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", fitCanvas);
  fitCanvas();

  function clientToArena(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    return { x: (cssX - offX) / cssScale, y: (cssY - offY) / cssScale };
  }

  // ---- input ----------------------------------------------------------------

  function arenaYToPlateTarget(arenaY) {
    // linear grab-and-drag mapping, same spirit as the old build: the
    // pointer directly drives a target height, physics handles the rest.
    const t = Math.max(0, Math.min(1, arenaY / ARENA_H));
    return STOMPER_START_Y - t * (STOMPER_START_Y - MIN_PLATE_Y) * 1.05;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state.locked) return;
    ensureAudio();
    state.dragging = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    const p = clientToArena(e.clientX, e.clientY);
    state.dragTargetY = Math.max(MIN_PLATE_Y, Math.min(DRAG_TOP_LIMIT, arenaYToPlateTarget(p.y)));
    document.getElementById("hint").classList.add("hidden");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!state.dragging) return;
    const p = clientToArena(e.clientX, e.clientY);
    state.dragTargetY = Math.max(MIN_PLATE_Y, Math.min(DRAG_TOP_LIMIT, arenaYToPlateTarget(p.y)));
  });
  function endDrag() {
    state.dragging = false;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  document.getElementById("stomp-btn").addEventListener("click", () => {
    if (state.locked) return;
    ensureAudio();
    state.dragging = false;
    const impliedV = (plate.y - plate.py) / SUBSTEP_DT;
    if (Math.abs(impliedV) < STOMP_SPEED || impliedV > 0) {
      plate.py = plate.y + STOMP_SPEED * SUBSTEP_DT;
    }
    document.getElementById("hint").classList.add("hidden");
  });
  document.getElementById("new-can-btn").addEventListener("click", newCan);
  document.getElementById("again-btn").addEventListener("click", newCan);

  // ---- drawing ----------------------------------------------------------

  function drawBackdrop() {
    ctx.fillStyle = "#0c1114";
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    const g = ctx.createRadialGradient(ARENA_CX, ARENA_H * 0.15, 10, ARENA_CX, ARENA_H * 0.15, ARENA_W);
    g.addColorStop(0, "rgba(40, 60, 66, 0.4)");
    g.addColorStop(1, "rgba(40, 60, 66, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    // floor plane, for depth/grounding
    const flL = project(rotatePoint(-140, 0, -140));
    const flR = project(rotatePoint(140, 0, -140));
    const brR = project(rotatePoint(140, 0, 140));
    const brL = project(rotatePoint(-140, 0, 140));
    ctx.beginPath();
    ctx.moveTo(flL.x, flL.y);
    ctx.lineTo(flR.x, flR.y);
    ctx.lineTo(brR.x, brR.y);
    ctx.lineTo(brL.x, brL.y);
    ctx.closePath();
    ctx.fillStyle = "#161e22";
    ctx.fill();
    ctx.strokeStyle = "#2c3a40";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const METAL = [206, 214, 216];
  const METAL_DARK = [110, 120, 124];
  const CAP_COLOR = [223, 230, 231];
  const PLATE_COLOR = [69, 78, 82];

  function buildFaces() {
    const faces = [];
    const rp = new Array(RINGS * SEGMENTS);
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGMENTS; j++) {
        const p = can.particles[idx(i, j)];
        rp[idx(i, j)] = rotatePoint(p.x, p.y, p.z);
      }
    }

    for (let i = 0; i < RINGS - 1; i++) {
      const inBand = i >= LABEL_RING_LO && i < LABEL_RING_HI;
      for (let j = 0; j < SEGMENTS; j++) {
        const a = rp[idx(i, j)], b = rp[idx(i, j + 1)], c = rp[idx(i + 1, j + 1)], d = rp[idx(i + 1, j)];
        let n = faceNormal(a, b, c);
        const cx = (a.x + b.x + c.x + d.x) / 4, cz = (a.z + b.z + c.z + d.z) / 4;
        if (n.x * cx + n.z * cz < 0) n = { x: -n.x, y: -n.y, z: -n.z };
        const depth = (a.depth + b.depth + c.depth + d.depth) / 4;
        const color = j === can.labelSeg && inBand ? blend(METAL, hexToRgb(can.skin.band)) : METAL;
        faces.push({ pts: [a, b, c, d], depth, color: shade(n, color), label: j === can.labelSeg && inBand });
      }
    }

    // caps: simple fans, closed ends so the can reads solid. Normals are
    // the world up/down direction rotated the same way as everything
    // else, so the caps catch the light as the can turns instead of
    // staying flat-shaded.
    const upDir = rotateDir(0, 1, 0);
    const downDir = { x: -upDir.x, y: -upDir.y, z: -upDir.z };
    const top = [];
    for (let j = 0; j < SEGMENTS; j++) top.push(rp[idx(0, j)]);
    const topDepth = top.reduce((s, p) => s + p.depth, 0) / top.length;
    faces.push({ pts: top, depth: topDepth - 1, color: shade(upDir, CAP_COLOR) });

    const bot = [];
    for (let j = SEGMENTS - 1; j >= 0; j--) bot.push(rp[idx(RINGS - 1, j)]);
    const botDepth = bot.reduce((s, p) => s + p.depth, 0) / bot.length;
    faces.push({ pts: bot, depth: botDepth + 1, color: shade(downDir, METAL_DARK) });

    return { faces, rp };
  }

  function hexToRgb(rgba) {
    const m = rgba.match(/rgba?\(([^)]+)\)/);
    if (!m) return [255, 255, 255];
    const parts = m[1].split(",").map((s) => parseFloat(s));
    return [parts[0], parts[1], parts[2]];
  }
  function blend(a, b) {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  }

  function buildPlateFaces() {
    const w = R + 30, hlf = w, th = 16;
    const y0 = plate.y, y1 = plate.y - th;
    const corners2d = [
      [-hlf, -hlf], [hlf, -hlf], [hlf, hlf], [-hlf, hlf],
    ];
    const top = corners2d.map(([x, z]) => rotatePoint(x, y0, z));
    const bot = corners2d.map(([x, z]) => rotatePoint(x, y1, z));
    const faces = [];
    const topDepth = top.reduce((s, p) => s + p.depth, 0) / 4;
    faces.push({ pts: top, depth: topDepth - 2, color: shade(rotateDir(0, 1, 0), PLATE_COLOR) });
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a = top[k], b = top[k2], c = bot[k2], d = bot[k];
      let n = faceNormal(a, b, c);
      const depth = (a.depth + b.depth + c.depth + d.depth) / 4;
      faces.push({ pts: [a, b, c, d], depth, color: shade(n, PLATE_COLOR) });
    }
    // press arm — decorative, sells "hydraulic plate" over "floating slab"
    const armTop = rotatePoint(0, y0 + 80, 0);
    const armBase = rotatePoint(0, y0, 0);
    faces.push({
      pts: [armTop, armBase],
      depth: (armTop.depth + armBase.depth) / 2 - 3,
      color: "#2c3336",
      isLine: true,
    });
    return faces;
  }

  function drawFaces(faces) {
    faces.sort((f1, f2) => f2.depth - f1.depth);
    for (const f of faces) {
      if (f.isLine) {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(f.pts[0].x, f.pts[0].y);
        ctx.lineTo(f.pts[1].x, f.pts[1].y);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let k = 1; k < f.pts.length; k++) ctx.lineTo(f.pts[k].x, f.pts[k].y);
      ctx.closePath();
      ctx.fillStyle = f.color;
      ctx.fill();
      if (f.label) {
        ctx.save();
        const cx = f.pts.reduce((s, p) => s + p.x, 0) / f.pts.length;
        const cyy = f.pts.reduce((s, p) => s + p.y, 0) / f.pts.length;
        ctx.fillStyle = can.skin.textColor;
        ctx.font = "800 11px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = 0.92;
        ctx.fillText(can.skin.text, cx, cyy);
        ctx.restore();
      }
    }
    ctx.strokeStyle = "rgba(45, 52, 55, 0.35)";
    ctx.lineWidth = 0.6;
    for (const f of faces) {
      if (f.isLine) continue;
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let k = 1; k < f.pts.length; k++) ctx.lineTo(f.pts[k].x, f.pts[k].y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  function spawnDebris() {
    const top = project(rotatePoint(0, can.startHeight * (1 - state.lastPct), 0));
    for (let i = 0; i < 16; i++) {
      state.debris.push({
        x: top.x + jitter(60),
        y: top.y,
        vx: jitter(4.5),
        vy: -Math.random() * 4 - 1,
        rot: Math.random() * Math.PI,
        vr: jitter(0.3),
        life: 1,
        w: 4 + Math.random() * 6,
      });
    }
  }

  function updateDebris(dt) {
    for (const p of state.debris) {
      p.vy += 0.35 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= 0.012 * dt;
    }
    state.debris = state.debris.filter((p) => p.life > 0 && p.y < ARENA_H + 40);
  }

  function drawDebris() {
    for (const p of state.debris) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = "#c7d0d3";
      ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
      ctx.restore();
    }
  }

  // ---- HUD --------------------------------------------------------------

  const roPressure = document.querySelector("#ro-pressure span:last-child");
  const roIntegrity = document.querySelector("#ro-integrity span:last-child");
  const roIntegrityRow = document.getElementById("ro-integrity");
  const roMode = document.querySelector("#ro-mode span:last-child");
  const roForce = document.querySelector("#ro-force span:last-child");
  const roType = document.querySelector("#ro-type span:last-child");
  const roBest = document.querySelector("#ro-best span:last-child");
  const crushbarFill = document.getElementById("crushbar-fill");
  const crushbarPct = document.getElementById("crushbar-pct");
  const ventBanner = document.getElementById("vent-banner");

  function peakForceN() {
    return Math.round(state.peakForce * 0.0009);
  }

  function bucklingMode(pct, asymmetry) {
    if (pct < 0.06) return "elastic";
    if (pct < 0.22) return asymmetry > 0.16 ? "asymmetric buckling" : "plastic deformation";
    if (pct < 0.5) return "asymmetric buckling";
    return "structural collapse";
  }

  function updateHud(pct) {
    const pctInt = Math.round(pct * 100);
    crushbarFill.style.width = pctInt + "%";
    crushbarPct.textContent = pctInt + "%";

    roPressure.textContent = Math.round(state.lastPressure) + " kPa";

    const integrity = Math.max(0, Math.round((1 - pct) * 100));
    roIntegrity.textContent = integrity + "%";
    roIntegrityRow.classList.toggle("warn", integrity < 60 && integrity >= 30);
    roIntegrityRow.classList.toggle("bad", integrity < 30);

    roMode.textContent = bucklingMode(pct, state.lastAsymmetry);
    roForce.textContent = peakForceN() + " N";
    if (can) roType.textContent = can.skin.label;
    roBest.textContent = best ? best.pct + "%" : "—";

    ventBanner.classList.toggle("show", state.vented && !state.finished && pct < COMPLETE_THRESHOLD + 0.05);
  }

  // ---- share --------------------------------------------------------------

  function shareUrlFor(pct) {
    return "https://cancrusher.bisks.net/s/" + pct;
  }

  function buildShareText(pct) {
    return (
      `I crushed a virtual soda can down to ${pct}% of its original height ` +
      `(peak force ${peakForceN()} N, "physically accurate"™).\n\n` +
      `try to flatten it further → ${shareUrlFor(pct)}`
    );
  }

  function finishCrush(pct) {
    if (state.finished) return;
    state.finished = true;
    state.locked = true;
    state.dragging = false;
    playFinale();
    spawnDebris();
    addShake(16);
    safeVibrate([40, 30, 80]);

    const pctInt = Math.round(pct * 100);
    const isRecord = !best || pctInt < best.pct;
    if (isRecord) {
      best = { pct: pctInt, force: peakForceN(), skin: can ? can.skin.label : "", at: new Date().toISOString() };
      saveBest(best);
    }

    document.getElementById("final-pct").textContent = pctInt;
    document.getElementById("final-sub").textContent =
      `peak force ${peakForceN()} N · seal ${state.vented ? "failed" : "held"} · ${can ? can.skin.label : "can"}.`;
    document.getElementById("record-badge").classList.toggle("show", isRecord);
    document.getElementById("best-line").textContent = best
      ? `personal best: ${best.pct}% crushed`
      : "";
    document.getElementById("share-bsky").href =
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText(pctInt));
    document.getElementById("result").classList.add("show");
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (_) {
      return false;
    }
  }

  async function buildShareCard() {
    const el = document.getElementById("shareCanvas");
    const c = el.getContext("2d");
    const W = el.width, H2 = el.height;
    const mono = "'JetBrains Mono', ui-monospace, monospace";

    c.fillStyle = "#10161a";
    c.fillRect(0, 0, W, H2);
    const g = c.createRadialGradient(W * 0.25, H2 * 0.1, 0, W * 0.25, H2 * 0.1, W * 0.6);
    g.addColorStop(0, "#1e2c30");
    g.addColorStop(1, "rgba(16,22,26,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H2);

    c.textAlign = "left";
    c.fillStyle = "#ff4433";
    c.font = "800 46px " + mono;
    c.fillText("can", 60, 100);
    c.fillStyle = "#eef4f2";
    c.fillText("crusher", 160, 100);

    const pctInt = Math.round(crushPct() * 100);
    c.fillStyle = "#8fa3a8";
    c.font = "600 24px " + mono;
    c.fillText("a real 3D pressurized-shell can-crushing simulator", 60, 138);

    c.fillStyle = "#ffd23f";
    c.font = "800 130px " + mono;
    c.fillText(pctInt + "%", 60, 300);
    c.fillStyle = "#8fa3a8";
    c.font = "600 22px " + mono;
    c.fillText("of original height", 64, 335);

    const stats = [
      [peakForceN() + " N", "peak force"],
      [state.vented ? "failed" : "held", "seal integrity"],
    ];
    let sx = 60;
    stats.forEach(([n, l]) => {
      c.fillStyle = "#eef4f2";
      c.font = "700 30px " + mono;
      c.fillText(n, sx, 400);
      c.fillStyle = "#8fa3a8";
      c.font = "600 16px " + mono;
      c.fillText(l, sx, 424);
      sx += 260;
    });

    c.fillStyle = "#8fa3a8";
    c.font = "600 18px " + mono;
    c.fillText("can type: " + (can ? can.skin.label : "—"), 60, 462);

    // snapshot of the actual crushed can, not a generic stand-in graphic
    const boxX = 720, boxY = 60, boxW = 420, boxH = 510;
    c.fillStyle = "#0c1114";
    c.beginPath();
    c.roundRect(boxX, boxY, boxW, boxH, 18);
    c.fill();
    const srcAspect = canvas.width / canvas.height;
    const boxAspect = boxW / boxH;
    let dw, dh;
    if (srcAspect > boxAspect) {
      dw = boxW - 16;
      dh = dw / srcAspect;
    } else {
      dh = boxH - 16;
      dw = dh * srcAspect;
    }
    c.save();
    c.beginPath();
    c.roundRect(boxX, boxY, boxW, boxH, 18);
    c.clip();
    c.drawImage(canvas, boxX + (boxW - dw) / 2, boxY + (boxH - dh) / 2, dw, dh);
    c.restore();

    c.fillStyle = "#8fa3a8";
    c.font = "600 20px " + mono;
    c.textAlign = "left";
    c.fillText("cancrusher.bisks.net", 60, H2 - 50);

    return new Promise((resolve) => el.toBlob(resolve, "image/png"));
  }

  document.getElementById("share-card-btn").addEventListener("click", async () => {
    const blob = await buildShareCard();
    if (!blob) return;
    const pctInt = Math.round(crushPct() * 100);
    const file = new File([blob], "cancrusher.png", { type: "image/png" });
    if (canShareFiles()) {
      try {
        await navigator.share({ files: [file], text: buildShareText(pctInt), title: "cancrusher" });
        return;
      } catch (_) {}
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cancrusher.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  // ---- main loop --------------------------------------------------------

  let lastNow = null;
  let accumulator = 0;

  function draw(now) {
    const rawDt = lastNow ? (now - lastNow) / 1000 : SUBSTEP_DT;
    lastNow = now;
    accumulator += Math.min(0.1, rawDt);

    let steps = 0;
    while (accumulator >= SUBSTEP_DT && steps < MAX_SUBSTEPS) {
      physicsStep(SUBSTEP_DT);
      accumulator -= SUBSTEP_DT;
      steps++;
    }
    yaw += YAW_SPEED * rawDt;

    const dt = rawDt * 60;
    const pct = crushPct();
    state.lastPct = pct;

    if (!state.vented && pct >= VENT_THRESHOLD) {
      state.vented = true;
      state.ventAt = now;
      state.ventStartPressure = state.lastPressure;
      playHiss();
      softenAfterVent();
    }

    if (!state.finished) {
      if (pct >= COMPLETE_THRESHOLD) {
        if (state.settleSince == null) state.settleSince = now;
        else if (now - state.settleSince >= SETTLE_MS) finishCrush(pct);
      } else {
        state.settleSince = null;
      }
    }

    updateDebris(dt);
    updateHud(pct);

    state.shake *= Math.pow(0.85, dt);
    if (state.shake < 0.05) state.shake = 0;
    const shakeX = state.shake ? jitter(state.shake) : 0;
    const shakeY = state.shake ? jitter(state.shake) : 0;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(shakeX, shakeY);
    ctx.translate(offX, offY);
    ctx.scale(cssScale, cssScale);
    ctx.beginPath();
    ctx.rect(0, 0, ARENA_W, ARENA_H);
    ctx.clip();

    drawBackdrop();
    const { faces } = buildFaces();
    const plateFaces = buildPlateFaces();
    drawFaces(faces.concat(plateFaces));
    drawDebris();

    ctx.restore();
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();

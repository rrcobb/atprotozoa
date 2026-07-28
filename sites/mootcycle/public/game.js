// game.js — mootcycle. A 2000s-Flash-portal-style 2D physics hill bike, in
// the Hill Climb Racing / Elastomania lineage: gas and brake are BOTH the
// throttle and the balance control. Grounded, they accelerate/reverse.
// Airborne, they torque the bike's lean (gas noses up, brake noses down) —
// hold gas too long over a jump and you rotate onto your back, so tap brake
// to level off before you land. Land at too steep an angle vs. the slope
// and it's a wipeout. Terrain is an endless multi-octave sine hill, seeded
// from the loaded handle's DID (same handle -> same hills, always), and
// gets choppier the further you get. No build step, no dependencies —
// vanilla canvas + Web Audio, wired directly to the DOM ids in index.html.
(function () {
  "use strict";

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const COLOR = {
    skyTop: cssVar("--sky-top"), skyMid: cssVar("--sky-mid"), skyBot: cssVar("--sky-bot"),
    sun: cssVar("--sun"), hillFar: cssVar("--hill-far"), hillNear: cssVar("--hill-near"),
    ink: cssVar("--ink"), muted: cssVar("--muted"), accent: cssVar("--accent"),
    accent2: cssVar("--accent-2"), warn: cssVar("--warn"),
  };

  // ---- DOM -----------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const el = (id) => document.getElementById(id);
  const els = {
    hudDist: el("hudDist"), hudBest: el("hudBest"),
    startScreen: el("startScreen"), handleInput: el("handleInput"), statusStart: el("statusStart"),
    btnStart: el("btnStart"),
    crashScreen: el("crashScreen"), crashTitle: el("crashTitle"), crashDist: el("crashDist"),
    crashBest: el("crashBest"), btnShare: el("btnShare"), btnRetry: el("btnRetry"),
    btnChangeHandle: el("btnChangeHandle"),
    touchControls: el("touchControls"), btnGas: el("btnGas"), btnBrake: el("btnBrake"),
  };

  // ---- view / camera ---------------------------------------------------
  let VIEW_W = 0, VIEW_H = 0, DPR = 1, GROUND_BASE = 0, PLAYER_SCREEN_X = 0;
  function resize() {
    VIEW_W = window.innerWidth;
    VIEW_H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(VIEW_W * DPR);
    canvas.height = Math.round(VIEW_H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    GROUND_BASE = VIEW_H * 0.58;
    PLAYER_SCREEN_X = VIEW_W * 0.32;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- terrain -----------------------------------------------------------
  let seedA = 0, seedB = 0, seedC = 0, seedD = 0, farSeed = 0;
  function hashInt(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function seedTerrain(seedStr) {
    const h = hashInt(seedStr);
    seedA = ((h % 1000) / 1000) * Math.PI * 2;
    seedB = (((h >> 3) % 1000) / 1000) * Math.PI * 2;
    seedC = (((h >> 7) % 1000) / 1000) * Math.PI * 2;
    seedD = (((h >> 11) % 1000) / 1000) * Math.PI * 2;
    farSeed = (((h >> 13) % 1000) / 1000) * Math.PI * 2;
  }
  const DIFFICULTY_RUN = 8000; // world px over which terrain gets choppier
  function difficultyT(x) {
    return Math.min(Math.max(x, 0) / DIFFICULTY_RUN, 1);
  }
  function terrainY(x) {
    const t = difficultyT(x);
    const a1 = 40 + 26 * t, a2 = 20 + 12 * t, a3 = 9 + 9 * t, a4 = 4 + 9 * t;
    return (
      GROUND_BASE +
      Math.sin(x * 0.0026 + seedA) * a1 +
      Math.sin(x * 0.0074 + seedB) * a2 +
      Math.sin(x * 0.017 + seedC) * a3 +
      Math.sin(x * 0.043 + seedD) * a4
    );
  }
  function farY(x) {
    return GROUND_BASE - 70 + Math.sin(x * 0.0016 + farSeed) * 34;
  }
  function slopeAngle(x) {
    const d = 5;
    return Math.atan2(terrainY(x + d) - terrainY(x - d), d * 2);
  }
  function angleDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // ---- physics constants -------------------------------------------------
  const WHEELBASE = 44, WHEEL_R = 12, RIDE_H = WHEEL_R + 3;
  const AIR_GRAVITY = 1750, SLOPE_GRAVITY = 780;
  const ACCEL = 340, BRAKE_DECEL = 460, ROLL_FRICTION = 0.55;
  const MAX_SPD = 620, MIN_SPD = -260;
  const AIR_TORQUE_GAS = 3.5, AIR_TORQUE_BRAKE = 4.3, NOSE_DIP = 1.0;
  const AIR_DAMP = 0.9; // per 1/60s
  const CRASH_ANGLE = (63 * Math.PI) / 180;
  const LANDING_DAMP = 0.9;
  const CRASH_ANIM_TIME = 0.55;
  const M_PX = 11; // world px per displayed "meter"

  // ---- audio (tiny, no autoplay — starts on user gesture) ---------------
  const Audio_ = (function () {
    let actx = null, master = null, engineOsc = null, engineGain = null;
    function ensure() {
      if (actx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.5;
      master.connect(actx.destination);
      engineOsc = actx.createOscillator();
      engineOsc.type = "sawtooth";
      engineGain = actx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    function resume() { if (actx && actx.state === "suspended") actx.resume(); }
    function setEngine(spd, grounded, running) {
      if (!actx) return;
      const t = actx.currentTime;
      const target = running ? 0.06 + Math.min(Math.abs(spd) / MAX_SPD, 1) * 0.08 : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.05);
      const freq = 70 + Math.min(Math.abs(spd), MAX_SPD) * 0.32 + (grounded ? 0 : 18);
      engineOsc.frequency.setTargetAtTime(freq, t, 0.04);
    }
    function noise(dur, peak, cutoff) {
      if (!actx) return;
      const n = Math.floor(actx.sampleRate * dur);
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = actx.createBufferSource();
      src.buffer = buf;
      const lp = actx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = cutoff;
      const g = actx.createGain();
      const t0 = actx.currentTime;
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(lp); lp.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur);
    }
    function thud() {
      if (!actx) return;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = "sine";
      const t0 = actx.currentTime;
      o.frequency.setValueAtTime(120, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
      g.gain.setValueAtTime(0.35, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.16);
    }
    function crashSound() { noise(0.45, 0.55, 1400); thud(); }
    return { ensure, resume, setEngine, crashSound };
  })();

  // ---- input --------------------------------------------------------
  const input = { gas: false, brake: false };
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowUp" || e.code === "KeyW") { input.gas = true; e.preventDefault(); }
    if (e.code === "ArrowDown" || e.code === "KeyS") { input.brake = true; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowUp" || e.code === "KeyW") input.gas = false;
    if (e.code === "ArrowDown" || e.code === "KeyS") input.brake = false;
  });
  function bindHold(btn, key) {
    const on = (e) => { e.preventDefault(); input[key] = true; btn.classList.add("down"); Audio_.ensure(); Audio_.resume(); };
    const off = (e) => { if (e) e.preventDefault(); input[key] = false; btn.classList.remove("down"); };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("pointerleave", off);
  }
  bindHold(els.btnGas, "gas");
  bindHold(els.btnBrake, "brake");
  if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
    els.touchControls.classList.add("on");
  }

  // ---- rider image ---------------------------------------------------
  function loadImg(url) {
    if (!url) return null;
    const img = new Image();
    img.src = url;
    return img;
  }
  function imgReady(img) {
    return img && img.complete && img.naturalWidth > 0;
  }

  // ---- persistence -----------------------------------------------------
  function bestKey(seed) { return "mootcycle.best." + seed; }
  function getBest(seed) {
    try { return parseInt(localStorage.getItem(bestKey(seed)) || "0", 10) || 0; }
    catch (_) { return 0; }
  }
  function setBest(seed, v) {
    try { localStorage.setItem(bestKey(seed), String(v)); } catch (_) {}
  }

  // ---- state -------------------------------------------------------
  let mode = "idle"; // idle | riding | crashing | crashed
  let seedKey = "anon";
  let riderAvatar = null;
  let crashTimer = 0;
  let crashReason = "";
  const CRASH_LINES = ["wipeout", "faceplant!", "yard sale", "sent it too hard", "back to the moot"];

  const state = {
    x: 0, y: 0, vx: 0, vy: 0, spd: 0,
    angle: 0, angVel: 0, grounded: true,
    dist: 0, wheelSpin: 0,
  };

  let particles = [];
  function spawnDebris(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 220;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80,
        life: 0.5 + Math.random() * 0.5, age: 0,
        r: 1.5 + Math.random() * 2.5,
        color: Math.random() < 0.5 ? COLOR.warn : COLOR.ink,
      });
    }
  }
  let exhaustTimer = 0;
  function spawnExhaust() {
    const rx = state.x - Math.cos(state.angle) * (WHEELBASE / 2);
    const ry = state.y - Math.sin(state.angle) * (WHEELBASE / 2);
    particles.push({
      x: rx, y: ry, vx: -state.spd * 0.15 + (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 20,
      life: 0.35, age: 0, r: 2 + Math.random() * 2, color: COLOR.muted, smoke: true,
    });
    if (particles.length > 80) particles.splice(0, particles.length - 80);
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.vy += (p.smoke ? -20 : AIR_GRAVITY * 0.7) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function resetRun(seed, avatarUrl) {
    seedTerrain(seed);
    seedKey = seed;
    riderAvatar = loadImg(avatarUrl);
    state.x = 0;
    state.y = terrainY(0) - RIDE_H;
    state.vx = 0; state.vy = 0; state.spd = 0;
    state.angle = slopeAngle(0); state.angVel = 0;
    state.grounded = true;
    state.dist = 0; state.wheelSpin = 0;
    particles = [];
    crashTimer = 0;
    mode = "riding";
    els.crashScreen.classList.add("hidden");
    updateHud();
  }

  function crash(reason) {
    if (mode !== "riding") return;
    mode = "crashing";
    crashTimer = CRASH_ANIM_TIME;
    crashReason = reason;
    spawnDebris(state.x, state.y, 16);
    Audio_.crashSound();
  }

  function finalizeCrash() {
    mode = "crashed";
    const dist = Math.floor(state.dist / M_PX);
    const best = Math.max(getBest(seedKey), dist);
    setBest(seedKey, best);
    els.crashTitle.textContent = CRASH_LINES[Math.floor(Math.random() * CRASH_LINES.length)];
    els.crashDist.innerHTML = dist + " <small>m</small>";
    els.crashBest.textContent = "best: " + best + " m";
    els.crashScreen.classList.remove("hidden");
    window.__mootcycleShare = { dist, best, seedKey };
  }

  function updateHud() {
    els.hudDist.textContent = Math.floor(state.dist / M_PX) + " m";
    els.hudBest.textContent = getBest(seedKey) + " m";
  }

  // ---- physics step ---------------------------------------------------
  function step(dt) {
    if (mode === "crashing") {
      state.angVel += NOSE_DIP * 0.5 * dt;
      state.angVel *= Math.pow(AIR_DAMP, dt * 60);
      state.angle += state.angVel * dt;
      updateParticles(dt);
      crashTimer -= dt;
      if (crashTimer <= 0) finalizeCrash();
      return;
    }
    if (mode !== "riding") return;

    if (state.grounded) {
      const slope = slopeAngle(state.x);
      state.spd += SLOPE_GRAVITY * Math.sin(slope) * dt;
      if (input.gas) state.spd += ACCEL * dt;
      if (input.brake) state.spd -= BRAKE_DECEL * dt;
      state.spd -= state.spd * ROLL_FRICTION * dt;
      state.spd = Math.max(MIN_SPD, Math.min(MAX_SPD, state.spd));
      state.vx = state.spd * Math.cos(slope);
      state.vy = state.spd * Math.sin(slope);
      state.angle = slope;
      state.angVel = 0;
      state.wheelSpin += (state.spd / WHEEL_R) * dt;
      if (input.gas && Math.abs(state.spd) > 40) {
        exhaustTimer -= dt;
        if (exhaustTimer <= 0) { spawnExhaust(); exhaustTimer = 0.04; }
      }
    } else {
      state.vy += AIR_GRAVITY * dt;
      let torque = 0;
      if (input.gas) torque -= AIR_TORQUE_GAS;
      if (input.brake) torque += AIR_TORQUE_BRAKE;
      if (!input.gas && !input.brake) torque += NOSE_DIP;
      state.angVel += torque * dt;
      state.angVel *= Math.pow(AIR_DAMP, dt * 60);
      state.angle += state.angVel * dt;
      state.wheelSpin += (state.spd / WHEEL_R) * dt;
    }

    state.x += state.vx * dt;
    state.y += state.vy * dt;

    const wasGrounded = state.grounded;
    const groundY = terrainY(state.x) - RIDE_H;
    if (state.y >= groundY) {
      if (!wasGrounded) {
        const slopeNow = slopeAngle(state.x);
        const diff = angleDiff(state.angle, slopeNow);
        if (Math.abs(diff) > CRASH_ANGLE) {
          state.y = groundY;
          crash("faceplant");
          return;
        }
        const dirSign = state.vx >= 0 ? 1 : -1;
        state.spd = Math.hypot(state.vx, state.vy) * dirSign * LANDING_DAMP;
      }
      state.grounded = true;
      state.y = groundY;
    } else {
      state.grounded = false;
    }

    state.dist = Math.max(state.dist, state.x);
    updateParticles(dt);
    Audio_.setEngine(state.spd, state.grounded, true);
    updateHud();
  }

  // ---- render -----------------------------------------------------
  function worldToScreenX(wx) {
    return wx - state.x + PLAYER_SCREEN_X;
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, COLOR.skyTop);
    g.addColorStop(0.55, COLOR.skyMid);
    g.addColorStop(1, COLOR.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const sx = VIEW_W * 0.76, sy = VIEW_H * 0.24, sr = Math.min(VIEW_W, VIEW_H) * 0.11;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.4);
    glow.addColorStop(0, "rgba(255,206,122,0.55)");
    glow.addColorStop(1, "rgba(255,206,122,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLOR.sun;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }

  function drawFarHills() {
    const camX = state.x - PLAYER_SCREEN_X;
    ctx.fillStyle = COLOR.hillFar;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    const step = 16;
    for (let sx = 0; sx <= VIEW_W; sx += step) {
      const wx = (camX + sx) * 0.4;
      ctx.lineTo(sx, farY(wx));
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrain() {
    const camX = state.x - PLAYER_SCREEN_X;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    const step = 6;
    const pts = [];
    for (let sx = 0; sx <= VIEW_W; sx += step) {
      const wx = camX + sx;
      pts.push([sx, terrainY(wx)]);
    }
    ctx.lineTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fillStyle = COLOR.hillNear;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = COLOR.accent2;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(worldToScreenX(p.x), p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWheel(lx, ly) {
    ctx.beginPath();
    ctx.arc(lx, ly, WHEEL_R, 0, Math.PI * 2);
    ctx.fillStyle = "#0e0a18";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(state.wheelSpin);
    ctx.strokeStyle = COLOR.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-WHEEL_R + 2, 0); ctx.lineTo(WHEEL_R - 2, 0);
    ctx.moveTo(0, -WHEEL_R + 2); ctx.lineTo(0, WHEEL_R - 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBike() {
    const sx = worldToScreenX(state.x);
    ctx.save();
    ctx.translate(sx, state.y);
    ctx.rotate(state.angle);

    drawWheel(-WHEELBASE / 2, 0);
    drawWheel(WHEELBASE / 2, 0);

    ctx.lineWidth = 4;
    ctx.strokeStyle = COLOR.ink;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-WHEELBASE / 2, 0);
    ctx.lineTo(6, -6);
    ctx.lineTo(WHEELBASE / 2, 0);
    ctx.stroke();

    // seat + rider torso
    ctx.strokeStyle = COLOR.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(9, -26);
    ctx.stroke();
    // handlebar
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(WHEELBASE / 2 - 4, -2);
    ctx.lineTo(WHEELBASE / 2 - 2, -16);
    ctx.stroke();
    // arm
    ctx.strokeStyle = COLOR.accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(9, -22);
    ctx.lineTo(WHEELBASE / 2 - 3, -15);
    ctx.stroke();

    // helmet
    const hx = 12, hy = -32, hr = 10;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (imgReady(riderAvatar)) {
      ctx.drawImage(riderAvatar, hx - hr, hy - hr, hr * 2, hr * 2);
    } else {
      ctx.fillStyle = COLOR.accent2;
      ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.ink;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    // visor
    ctx.fillStyle = "rgba(20,15,30,0.55)";
    ctx.beginPath();
    ctx.arc(hx + 2, hy + 1, hr * 0.62, -0.9, 0.9);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawSky();
    drawFarHills();
    drawTerrain();
    drawParticles();
    if (mode === "riding" || mode === "crashing") drawBike();
  }

  // ---- loop -----------------------------------------------------
  let lastT = 0;
  function frame(t) {
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(dt, 0.05);
    step(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- handle resolution / boot ---------------------------------------
  const API = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile";
  async function resolveActor(raw) {
    const handle = raw.trim().replace(/^@/, "");
    if (!handle) return null;
    const res = await fetch(API + "?actor=" + encodeURIComponent(handle));
    if (!res.ok) throw new Error("couldn't find @" + handle);
    const data = await res.json();
    return { did: data.did, handle: data.handle, avatar: data.avatar || "" };
  }

  function setStatus(msg, kind) {
    els.statusStart.textContent = msg || "";
    els.statusStart.className = kind || "";
  }

  let lastHandleRaw = "";

  async function beginRide() {
    Audio_.ensure();
    Audio_.resume();
    const raw = els.handleInput.value || "";
    lastHandleRaw = raw;
    els.btnStart.disabled = true;
    const prevLabel = els.btnStart.textContent;
    els.btnStart.textContent = "loading…";
    let actor = null;
    if (raw.trim()) {
      try {
        actor = await resolveActor(raw);
        setStatus("");
      } catch (err) {
        setStatus("couldn't find that handle — riding anonymous", "err");
      }
    } else {
      setStatus("");
    }
    els.btnStart.disabled = false;
    els.btnStart.textContent = prevLabel;
    els.startScreen.classList.add("hidden");
    if (actor) {
      resetRun(actor.did, actor.avatar);
    } else {
      resetRun("anon-" + Math.random().toString(36).slice(2), "");
    }
  }

  function buildShareText() {
    const info = window.__mootcycleShare || { dist: 0, best: 0 };
    const url = "https://bisks.net/games/mootcycle/";
    let text = "rode " + info.dist + "m on mootcycle before eating dirt";
    if (info.best > info.dist) text = "rode " + info.dist + "m on mootcycle (best: " + info.best + "m)";
    text += " — " + url;
    return text;
  }

  els.btnStart.addEventListener("click", beginRide);
  els.handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") beginRide();
  });
  els.btnRetry.addEventListener("click", () => {
    els.crashScreen.classList.add("hidden");
    resetRun(seedKey, riderAvatar ? riderAvatar.src : "");
  });
  els.btnChangeHandle.addEventListener("click", () => {
    els.crashScreen.classList.add("hidden");
    els.startScreen.classList.remove("hidden");
    els.handleInput.value = lastHandleRaw;
    mode = "idle";
  });
  els.btnShare.addEventListener("click", () => {
    const text = buildShareText();
    window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
  });

  // idle background scene before first ride
  seedTerrain("mootcycle-idle");
  state.x = 0;
  state.y = terrainY(0) - RIDE_H;
  state.angle = slopeAngle(0);
})();

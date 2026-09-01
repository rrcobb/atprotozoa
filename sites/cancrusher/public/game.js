// cancrusher — a physically-ish accurate soda can crushing simulator.
//
// @cee.wtf asked for a soda can crushing simulator. This isn't a finite-
// element solver (nothing running in a browser tab is), but it IS a real
// Matter.js soft-body sim rather than a canned animation: the can's wall is
// two chains of near-rigid rod constraints (left side, right side) linked by
// softer horizontal "rungs" and diagonal cross-braces. A chain of fixed-
// length rods pinned end to end can't shorten by stretching — the only way
// to close the gap between the fixed base and the descending press plate is
// for the chain to bow sideways, i.e. buckle, same as a compressed strut in
// real structural mechanics. Random per-constraint stiffness jitter seeds
// which side gives first, so no two crushes fold the same way. On top of
// that: internal can pressure is tracked (Boyle's-law-flavored, not exact)
// and "venting" past a crush threshold measurably softens the shell — a
// pressurized can really does resist crushing more than a vented one.
(function () {
  "use strict";

  const { Engine, World, Bodies, Body, Constraint, Runner, Events } = Matter;

  // ---- arena --------------------------------------------------------------

  const ARENA_W = 380;
  const ARENA_H = 600;
  const FLOOR_Y = ARENA_H - 60;

  const CAN_W = 118;
  const HALF_W = CAN_W / 2;
  const CAN_H = 280;
  const ROWS = 8;
  const ROW_SPACING = CAN_H / (ROWS - 1);
  const CX = ARENA_W / 2;
  const BOTTOM_ROW_Y = FLOOR_Y - 8;
  const TOP_ROW_Y = BOTTOM_ROW_Y - CAN_H;

  const CAP_H = 16;
  const CAP_W = CAN_W + 14;

  const STOMPER_W = CAN_W + 50;
  const STOMPER_H = 18;
  const STOMPER_START_Y = TOP_ROW_Y - 90;
  const DRAG_TOP_LIMIT = 40;

  const FOLLOW_K = 0.18;
  const MAX_DRAG_V = 22;
  const STOMP_IMPULSE = 27;

  const VENT_THRESHOLD = 0.14; // real cans lose most axial rigidity on the first real dent
  const COMPLETE_THRESHOLD = 0.55;
  const SETTLE_MS = 480;

  // ---- can skins ------------------------------------------------------------
  // Cosmetic variety plus a small, honest material tweak per skin: a taller
  // "reinforced" energy can resists the first dent a bit more (higher base
  // stiffness), a sparkling-water can is thinner-walled and gives faster.
  // Same VENT/COMPLETE thresholds across skins, so crush % stays comparable
  // for the personal-best tracker below.
  const SKINS = [
    { label: "cola classic", band: "rgba(255, 68, 51, 0.82)", text: "FIZZ!", textColor: "#ffe9a8", stiffMul: 1.0 },
    { label: "zero sugar", band: "rgba(20, 22, 24, 0.86)", text: "ZERO", textColor: "#eef4f2", stiffMul: 1.0 },
    { label: "energy+", band: "rgba(120, 255, 60, 0.8)", text: "BOOST", textColor: "#0c1114", stiffMul: 1.22 },
    { label: "sparkling water", band: "rgba(70, 160, 255, 0.68)", text: "SPARK", textColor: "#ffffff", stiffMul: 0.85 },
  ];
  function pickSkin() {
    return SKINS[Math.floor(Math.random() * SKINS.length)];
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

  // ---- physics setup --------------------------------------------------------

  const engine = Engine.create();
  engine.gravity.y = 1;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  engine.constraintIterations = 4;
  const world = engine.world;

  const NOGROUP = Body.nextGroup(true);

  function wallParticle(x, y) {
    const b = Bodies.circle(x, y, 6, {
      density: 0.0022,
      friction: 0.4,
      frictionAir: 0.015,
      restitution: 0.05,
    });
    b.collisionFilter.group = NOGROUP;
    return b;
  }

  function jitter(n) {
    return (Math.random() * 2 - 1) * n;
  }

  function makeBounds() {
    const t = 60;
    return [
      Bodies.rectangle(CX, FLOOR_Y + t / 2 + 6, ARENA_W + 300, t, { isStatic: true, friction: 0.9 }),
      Bodies.rectangle(-t / 2, ARENA_H / 2, t, ARENA_H + 300, { isStatic: true }),
      Bodies.rectangle(ARENA_W + t / 2, ARENA_H / 2, t, ARENA_H + 300, { isStatic: true }),
    ];
  }
  World.add(world, makeBounds());

  let can = null; // { rows, topCap, constraints: {vertical, rung, diag, base, cap}, softenable }
  let stomper = null;

  function buildStomper() {
    stomper = Bodies.rectangle(CX, STOMPER_START_Y, STOMPER_W, STOMPER_H, {
      density: 0.02,
      friction: 0.7,
      frictionAir: 0.05,
      restitution: 0,
    });
    World.add(world, stomper);
  }

  function buildCan() {
    const skin = pickSkin();
    const rows = [];
    for (let i = 0; i < ROWS; i++) {
      const y = TOP_ROW_Y + i * ROW_SPACING;
      const left = wallParticle(CX - HALF_W + jitter(3), y + jitter(1.5));
      const right = wallParticle(CX + HALF_W + jitter(3), y + jitter(1.5));
      rows.push({ left, right });
    }

    const topCap = Bodies.rectangle(CX, TOP_ROW_Y - CAP_H / 2 - 2, CAP_W, CAP_H, {
      density: 0.006,
      friction: 0.6,
      frictionAir: 0.03,
      restitution: 0,
    });

    const vertical = [];
    const rung = [];
    const diag = [];
    const base = [];

    function link(bodyA, bodyB, stiffness, damping) {
      return Constraint.create({ bodyA, bodyB, stiffness, damping: damping || 0.15 });
    }

    for (let i = 0; i < ROWS; i++) {
      rung.push(link(rows[i].left, rows[i].right, 0.5 * (0.9 + Math.random() * 0.2) * skin.stiffMul));
      if (i < ROWS - 1) {
        vertical.push(link(rows[i].left, rows[i + 1].left, (0.85 + Math.random() * 0.12) * skin.stiffMul));
        vertical.push(link(rows[i].right, rows[i + 1].right, (0.85 + Math.random() * 0.12) * skin.stiffMul));
        diag.push(link(rows[i].left, rows[i + 1].right, (0.18 + Math.random() * 0.08) * skin.stiffMul));
        diag.push(link(rows[i].right, rows[i + 1].left, (0.18 + Math.random() * 0.08) * skin.stiffMul));
      }
    }

    const bottom = rows[ROWS - 1];
    base.push(
      Constraint.create({
        bodyA: bottom.left,
        pointB: { x: bottom.left.position.x, y: bottom.left.position.y },
        stiffness: 0.7,
        damping: 0.5,
        length: 0,
      })
    );
    base.push(
      Constraint.create({
        bodyA: bottom.right,
        pointB: { x: bottom.right.position.x, y: bottom.right.position.y },
        stiffness: 0.7,
        damping: 0.5,
        length: 0,
      })
    );

    const capLinks = [
      Constraint.create({
        bodyA: topCap,
        pointA: { x: -CAP_W / 2 + 8, y: CAP_H / 2 },
        bodyB: rows[0].left,
        stiffness: 0.9,
        damping: 0.2,
      }),
      Constraint.create({
        bodyA: topCap,
        pointA: { x: CAP_W / 2 - 8, y: CAP_H / 2 },
        bodyB: rows[0].right,
        stiffness: 0.9,
        damping: 0.2,
      }),
    ];

    World.add(world, [
      ...rows.flatMap((r) => [r.left, r.right]),
      topCap,
      ...vertical,
      ...rung,
      ...diag,
      ...base,
      ...capLinks,
    ]);

    can = {
      rows,
      topCap,
      vertical,
      rung,
      diag,
      base,
      capLinks,
      skin,
      startHeight: bottom.left.position.y - topCap.position.y,
      baseY: bottom.left.position.y,
    };
  }

  function removeCan() {
    if (!can) return;
    World.remove(world, [
      ...can.rows.flatMap((r) => [r.left, r.right]),
      can.topCap,
      ...can.vertical,
      ...can.rung,
      ...can.diag,
      ...can.base,
      ...can.capLinks,
    ]);
    can = null;
  }

  // ---- game state -----------------------------------------------------------

  const state = {
    dragging: false,
    dragTargetY: STOMPER_START_Y,
    peakSpeed: 0,
    vented: false,
    finished: false,
    locked: false,
    settleSince: null,
    debris: [],
    shake: 0,
  };

  function resetState() {
    state.dragging = false;
    state.dragTargetY = STOMPER_START_Y;
    state.peakSpeed = 0;
    state.vented = false;
    state.finished = false;
    state.locked = false;
    state.settleSince = null;
    state.debris = [];
    state.shake = 0;
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
    removeCan();
    buildCan();
    Body.setPosition(stomper, { x: CX, y: STOMPER_START_Y });
    Body.setVelocity(stomper, { x: 0, y: 0 });
    Body.setAngle(stomper, 0);
    resetState();
    document.getElementById("result").classList.remove("show");
    document.getElementById("vent-banner").classList.remove("show");
    document.getElementById("hint").classList.remove("hidden");
  }

  buildStomper();
  buildCan();

  function crushPct() {
    if (!can) return 0;
    const currentHeight = can.baseY - can.topCap.position.y;
    const pct = 1 - currentHeight / can.startHeight;
    return Math.max(0, Math.min(1, pct));
  }

  function softenAfterVent() {
    [...can.rung, ...can.diag].forEach((c) => {
      c.stiffness *= 0.42;
    });
  }

  Events.on(engine, "beforeUpdate", () => {
    if (state.dragging && !state.locked) {
      const dy = state.dragTargetY - stomper.position.y;
      let vy = dy * FOLLOW_K;
      vy = Math.max(-MAX_DRAG_V, Math.min(MAX_DRAG_V, vy));
      Body.setVelocity(stomper, { x: 0, y: vy });
    }
    Body.setAngularVelocity(stomper, 0);
    if (Math.abs(stomper.angle) > 0.001) Body.setAngle(stomper, stomper.angle * 0.7);
    state.peakSpeed = Math.max(state.peakSpeed, stomper.speed);
  });

  function maybeCrunch(pair) {
    if (pair.bodyA !== stomper && pair.bodyB !== stomper) return;
    if (stomper.speed > 0.5) {
      playCrunch(stomper.speed);
      addShake(Math.min(14, stomper.speed * 0.9));
      if (stomper.speed > 4) safeVibrate(Math.min(60, stomper.speed * 4));
    }
  }
  Events.on(engine, "collisionStart", (e) => e.pairs.forEach(maybeCrunch));
  Events.on(engine, "collisionActive", (e) => e.pairs.forEach(maybeCrunch));

  // ---- canvas / camera --------------------------------------------------

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

  canvas.addEventListener("pointerdown", (e) => {
    if (state.locked) return;
    ensureAudio();
    state.dragging = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    const p = clientToArena(e.clientX, e.clientY);
    state.dragTargetY = Math.max(DRAG_TOP_LIMIT, Math.min(FLOOR_Y - 4, p.y));
    document.getElementById("hint").classList.add("hidden");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!state.dragging) return;
    const p = clientToArena(e.clientX, e.clientY);
    state.dragTargetY = Math.max(DRAG_TOP_LIMIT, Math.min(FLOOR_Y - 4, p.y));
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
    Body.setVelocity(stomper, { x: 0, y: Math.max(stomper.velocity.y, STOMP_IMPULSE) });
    document.getElementById("hint").classList.add("hidden");
  });
  document.getElementById("new-can-btn").addEventListener("click", newCan);
  document.getElementById("again-btn").addEventListener("click", newCan);

  // ---- drawing ----------------------------------------------------------

  function drawBackdrop() {
    ctx.fillStyle = "#0c1114";
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    const g = ctx.createRadialGradient(CX, ARENA_H * 0.15, 10, CX, ARENA_H * 0.15, ARENA_W);
    g.addColorStop(0, "rgba(40, 60, 66, 0.4)");
    g.addColorStop(1, "rgba(40, 60, 66, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    ctx.strokeStyle = "#2c3a40";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y + 6);
    ctx.lineTo(ARENA_W, FLOOR_Y + 6);
    ctx.stroke();
  }

  function drawCan() {
    if (!can) return;
    const rows = can.rows;
    ctx.beginPath();
    ctx.moveTo(rows[0].left.position.x, rows[0].left.position.y);
    for (let i = 1; i < rows.length; i++) ctx.lineTo(rows[i].left.position.x, rows[i].left.position.y);
    for (let i = rows.length - 1; i >= 0; i--) ctx.lineTo(rows[i].right.position.x, rows[i].right.position.y);
    ctx.closePath();
    const grad = ctx.createLinearGradient(CX - HALF_W - 20, 0, CX + HALF_W + 20, 0);
    grad.addColorStop(0, "#8a9296");
    grad.addColorStop(0.28, "#eef3f4");
    grad.addColorStop(0.55, "#c7d0d3");
    grad.addColorStop(1, "#767f83");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#4d565a";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // label band across the middle rows, plus rib lines for a corrugated read
    const bandStart = 2, bandEnd = 5;
    ctx.beginPath();
    ctx.moveTo(rows[bandStart].left.position.x, rows[bandStart].left.position.y);
    for (let i = bandStart + 1; i <= bandEnd; i++) ctx.lineTo(rows[i].left.position.x, rows[i].left.position.y);
    for (let i = bandEnd; i >= bandStart; i--) ctx.lineTo(rows[i].right.position.x, rows[i].right.position.y);
    ctx.closePath();
    ctx.fillStyle = can.skin.band;
    ctx.fill();

    const midRow = rows[Math.round((bandStart + bandEnd) / 2)];
    ctx.save();
    const mx = (midRow.left.position.x + midRow.right.position.x) / 2;
    const my = (midRow.left.position.y + midRow.right.position.y) / 2;
    const angle = Math.atan2(
      midRow.right.position.y - midRow.left.position.y,
      midRow.right.position.x - midRow.left.position.x
    );
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.fillStyle = can.skin.textColor;
    ctx.font = "800 15px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(can.skin.text, 0, 0);
    ctx.restore();

    ctx.strokeStyle = "rgba(77, 86, 90, 0.5)";
    ctx.lineWidth = 1;
    for (const r of rows) {
      ctx.beginPath();
      ctx.moveTo(r.left.position.x, r.left.position.y);
      ctx.lineTo(r.right.position.x, r.right.position.y);
      ctx.stroke();
    }
  }

  function drawCap() {
    if (!can) return;
    const cap = can.topCap;
    ctx.save();
    ctx.translate(cap.position.x, cap.position.y);
    ctx.rotate(cap.angle);
    ctx.beginPath();
    ctx.roundRect(-CAP_W / 2, -CAP_H / 2, CAP_W, CAP_H, 4);
    ctx.fillStyle = "#dfe6e7";
    ctx.fill();
    ctx.strokeStyle = "#8a9296";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(CAP_W * 0.18, 0, 6, 3, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#8a9296";
    ctx.stroke();
    ctx.restore();
  }

  function drawStomper() {
    ctx.save();
    ctx.translate(stomper.position.x, stomper.position.y);
    ctx.rotate(stomper.angle);
    ctx.beginPath();
    ctx.roundRect(-STOMPER_W / 2, -STOMPER_H / 2, STOMPER_W, STOMPER_H, 3);
    ctx.fillStyle = "#454e52";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 6;
    for (let x = -STOMPER_W; x < STOMPER_W; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, -STOMPER_H);
      ctx.lineTo(x + STOMPER_H * 2, STOMPER_H);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#1b2124";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // press arm, purely decorative — sells "hydraulic plate" over "floating bar"
    ctx.fillStyle = "#2c3336";
    ctx.fillRect(-6, -STOMPER_H / 2 - 60, 12, 60);
    ctx.restore();
  }

  function spawnDebris() {
    if (!can) return;
    for (let i = 0; i < 16; i++) {
      state.debris.push({
        x: CX + jitter(HALF_W),
        y: can.topCap.position.y,
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
    return Math.round(state.peakSpeed * 41);
  }

  function bucklingMode(pct) {
    if (pct < 0.06) return "elastic";
    if (pct < 0.22) return "plastic deformation";
    if (pct < 0.5) return "asymmetric buckling";
    return "structural collapse";
  }

  function updateHud(pct) {
    const pctInt = Math.round(pct * 100);
    crushbarFill.style.width = pctInt + "%";
    crushbarPct.textContent = pctInt + "%";

    const pressure = state.vented ? 101 : Math.round(331 + pct * 140);
    roPressure.textContent = pressure + " kPa";

    const integrity = Math.max(0, Math.round((1 - pct) * 100));
    roIntegrity.textContent = integrity + "%";
    roIntegrityRow.classList.toggle("warn", integrity < 60 && integrity >= 30);
    roIntegrityRow.classList.toggle("bad", integrity < 30);

    roMode.textContent = bucklingMode(pct);
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
    const W = el.width, H = el.height;
    const mono = "'JetBrains Mono', ui-monospace, monospace";

    c.fillStyle = "#10161a";
    c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.25, H * 0.1, 0, W * 0.25, H * 0.1, W * 0.6);
    g.addColorStop(0, "#1e2c30");
    g.addColorStop(1, "rgba(16,22,26,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.textAlign = "left";
    c.fillStyle = "#ff4433";
    c.font = "800 46px " + mono;
    c.fillText("can", 60, 100);
    c.fillStyle = "#eef4f2";
    c.fillText("crusher", 160, 100);

    const pctInt = Math.round(crushPct() * 100);
    c.fillStyle = "#8fa3a8";
    c.font = "600 24px " + mono;
    c.fillText("a physically-ish accurate soda can crushing simulator", 60, 138);

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
    c.fillText("cancrusher.bisks.net", 60, H - 50);

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
  function draw(now) {
    const dt = lastNow ? Math.min(2.5, (now - lastNow) / 16.7) : 1;
    lastNow = now;

    const pct = crushPct();

    if (!state.vented && pct >= VENT_THRESHOLD) {
      state.vented = true;
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
    drawCan();
    drawCap();
    drawDebris();
    drawStomper();

    ctx.restore();
    requestAnimationFrame(draw);
  }

  Runner.run(Runner.create(), engine);
  requestAnimationFrame(draw);
})();

// PIGGER — a Frogger for Nash Lane. You're a big, burly, hairy pigman
// doctor of mathematics crossing traffic for a cheap bottle of bourbon at
// the 7-Eleven, then crossing back with the bottle while the screen goes
// groovy and vertiginous. Grid-based movement over a 2D canvas buffer,
// then a small WebGL fragment-shader pass (#fx) resamples that buffer
// every frame — the shader is a no-op on the way there and ramps up on
// the way home. No build step, no framework, no files besides this one
// and index.html.

(function () {
  "use strict";

  // ---------- grid ----------
  const COLS = 9, ROWS = 8, TILE = 64;
  const WIDTH = COLS * TILE, HEIGHT = ROWS * TILE;

  // row 0 = 7-Eleven sidewalk (goal), row 7 = home sidewalk (start)
  const ROW_STORE = 0, ROW_HOME = 7, ROW_MEDIAN = 4;
  const LANES = {
    1: { dir: 1, speed: 92, gap: [170, 260], color: ["#e63946", "#f4a300"] },
    2: { dir: -1, speed: 128, gap: [150, 230], color: ["#2a9d8f", "#457b9d"] },
    3: { dir: 1, speed: 176, gap: [190, 300], color: ["#ff206e", "#8338ec"] },
    5: { dir: -1, speed: 112, gap: [160, 250], color: ["#f4a300", "#e63946"] },
    6: { dir: 1, speed: 150, gap: [140, 220], color: ["#457b9d", "#2a9d8f"] },
  };
  const ROAD_ROWS = Object.keys(LANES).map(Number);

  const BOURBONS = [
    { name: "Old Towpath", line: "OLD TOWPATH — Bridgeport's cheapest bourbon, proudly." },
    { name: "Colonel Cutrate", line: "COLONEL CUTRATE, the bottom shelf's bottom shelf." },
    { name: "Nash Street Reserve", line: "NASH STREET RESERVE — reserve of what is unclear." },
    { name: "Mathlete's Choice", line: "MATHLETE'S CHOICE, $8.99, tastes like a proof by contradiction." },
    { name: "Dr. Hogsworth's Emergency Bourbon", line: "DR. HOGSWORTH'S EMERGENCY BOURBON (that's you, on the label)." },
  ];

  // ---------- dom ----------
  const buffer = document.getElementById("buffer");
  const bctx = buffer.getContext("2d");
  const stage = document.getElementById("stage");
  const els = {
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    lives: document.getElementById("lives"),
    time: document.getElementById("time"),
    phaseTag: document.getElementById("phaseTag"),
    startOverlay: document.getElementById("startOverlay"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    buyOverlay: document.getElementById("buyOverlay"),
    buyLine: document.getElementById("buyLine"),
    overOverlay: document.getElementById("overOverlay"),
    overLine: document.getElementById("overLine"),
    finalScore: document.getElementById("finalScore"),
    winOverlay: document.getElementById("winOverlay"),
    winLine: document.getElementById("winLine"),
    winScore: document.getElementById("winScore"),
    winTime: document.getElementById("winTime"),
    startBtn: document.getElementById("startBtn"),
    buyContinueBtn: document.getElementById("buyContinueBtn"),
    againBtn: document.getElementById("againBtn"),
    restartBtn: document.getElementById("restartBtn"),
    shareBtn: document.getElementById("shareBtn"),
    shareBluesky: document.getElementById("shareBluesky"),
    sfxToggle: document.getElementById("sfxToggle"),
    tUp: document.getElementById("tUp"),
    tDown: document.getElementById("tDown"),
    tLeft: document.getElementById("tLeft"),
    tRight: document.getElementById("tRight"),
  };

  // ---------- audio ----------
  let actx = null;
  let sfxOn = true;
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function detuneNow() {
    return fx.intensity > 0.01 ? Math.sin(fx.t * 3.1) * 28 * fx.intensity : 0;
  }
  function tone(freq, dur, type, peak, delay) {
    if (!sfxOn || !actx) return;
    const t0 = actx.currentTime + (delay || 0);
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    osc.detune.value = detuneNow();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak == null ? 0.18 : peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function noiseBurst(dur, peak) {
    if (!sfxOn || !actx) return;
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const gain = actx.createGain();
    gain.gain.value = peak == null ? 0.25 : peak;
    const filt = actx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1800;
    src.connect(filt).connect(gain).connect(actx.destination);
    src.start();
  }
  function sfxStep() { tone(220 + Math.random() * 30, 0.05, "square", 0.05); }
  function sfxHonk() {
    tone(300, 0.16, "sawtooth", 0.14);
    tone(240, 0.2, "sawtooth", 0.1, 0.09);
  }
  function sfxCrash() {
    noiseBurst(0.35, 0.3);
    tone(90, 0.3, "square", 0.2);
  }
  function sfxBuy() {
    [523, 659, 784, 988].forEach((f, i) => tone(f, 0.22, "triangle", 0.16, i * 0.09));
  }
  function sfxWin() {
    [392, 523, 659, 784, 988, 1175].forEach((f, i) => tone(f, 0.3, "triangle", 0.15, i * 0.08));
  }
  function sfxOver() {
    [300, 250, 200, 140].forEach((f, i) => tone(f, 0.28, "sawtooth", 0.14, i * 0.11));
  }

  // ---------- rng helper (visual only, gameplay-neutral) ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // ---------- game state ----------
  const state = {
    mode: "start", // start | playing | paused | buy | over | win
    phase: "to7",  // to7 | home
    lives: 3,
    score: 0,
    best: 0,
    elapsed: 0,
    invuln: 0,
    bourbon: BOURBONS[0],
  };
  try { state.best = parseInt(localStorage.getItem("pigger-best") || "0", 10) || 0; } catch (e) {}
  els.best.textContent = state.best;

  const player = {
    gx: 4, gy: ROW_HOME,
    px: 0, py: 0, // pixel position, tweened
    fromX: 0, fromY: 0, toX: 0, toY: 0,
    moving: false, t: 0, dur: 0.11,
    facing: "up",
    bestGy: ROW_HOME, // for scoring progress
  };
  function snapPlayerPixels() {
    const px = player.gx * TILE + TILE / 2, py = player.gy * TILE + TILE / 2;
    player.px = player.toX = player.fromX = px;
    player.py = player.toY = player.fromY = py;
  }
  snapPlayerPixels();

  let lanes = []; // per road row: {row, dir, speed, cars:[{x}], carW, carH}
  function initLanes() {
    lanes = ROAD_ROWS.map((row) => {
      const def = LANES[row];
      const carW = 58, carH = 40;
      const cars = [];
      let x = rand(0, 200);
      while (x < WIDTH + 300) {
        cars.push({ x: def.dir > 0 ? x - 300 : WIDTH + 300 - x, colorIdx: Math.random() < 0.5 ? 0 : 1, wobble: rand(0, 10) });
        x += rand(def.gap[0], def.gap[1]);
      }
      return { row, dir: def.dir, speed: def.speed, cars, carW, carH, colors: def.color };
    });
  }
  initLanes();

  function laneSpeedMul() {
    // walk-home phase: traffic's a little wilder (later, drunker students)
    return state.phase === "home" ? 1.18 : 1;
  }

  function updateLanes(dt) {
    const mul = laneSpeedMul();
    for (const lane of lanes) {
      const step = lane.dir * lane.speed * mul * dt;
      for (const car of lane.cars) car.x += step;
      const carW = lane.carW;
      if (lane.dir > 0) {
        for (const car of lane.cars) {
          if (car.x > WIDTH + carW) car.x -= WIDTH + carW * 2 + rand(0, 120);
        }
      } else {
        for (const car of lane.cars) {
          if (car.x < -carW * 2) car.x += WIDTH + carW * 2 + rand(0, 120);
        }
      }
    }
  }

  // ---------- input ----------
  const keyMap = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };
  function tryMove(dir) {
    if (state.mode !== "playing" || player.moving) return;
    let ngx = player.gx, ngy = player.gy;
    if (dir === "up") { ngy--; player.facing = "up"; }
    else if (dir === "down") { ngy++; player.facing = "down"; }
    else if (dir === "left") { ngx--; player.facing = "left"; }
    else if (dir === "right") { ngx++; player.facing = "right"; }
    if (ngx < 0 || ngx >= COLS || ngy < 0 || ngy >= ROWS) return;
    player.fromX = player.px; player.fromY = player.py;
    player.gx = ngx; player.gy = ngy;
    player.toX = ngx * TILE + TILE / 2; player.toY = ngy * TILE + TILE / 2;
    player.moving = true; player.t = 0;
    sfxStep();
    // scoring: forward progress only
    if (state.phase === "to7" && ngy < player.bestGy) {
      state.score += 10; player.bestGy = ngy;
    } else if (state.phase === "home" && ngy > player.bestGy) {
      state.score += 10; player.bestGy = ngy;
    }
    updateHud();
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P") { togglePause(); return; }
    if (e.key === "m" || e.key === "M") { toggleSfx(); return; }
    const dir = keyMap[e.key];
    if (dir) { e.preventDefault(); tryMove(dir); }
  });
  function bindHold(el, dir) {
    if (!el) return;
    const go = (ev) => { ev.preventDefault(); ensureAudio(); tryMove(dir); };
    el.addEventListener("touchstart", go, { passive: false });
    el.addEventListener("mousedown", go);
  }
  bindHold(els.tUp, "up"); bindHold(els.tDown, "down");
  bindHold(els.tLeft, "left"); bindHold(els.tRight, "right");

  function togglePause() {
    if (state.mode === "playing") { state.mode = "paused"; els.pauseOverlay.classList.remove("hidden"); }
    else if (state.mode === "paused") { state.mode = "playing"; els.pauseOverlay.classList.add("hidden"); }
  }
  function toggleSfx() {
    sfxOn = !sfxOn;
    els.sfxToggle.setAttribute("aria-pressed", String(sfxOn));
  }
  els.sfxToggle.addEventListener("click", toggleSfx);

  // ---------- flow ----------
  function resetRun() {
    state.phase = "to7"; state.lives = 3; state.score = 0; state.elapsed = 0; state.invuln = 0;
    state.bourbon = pick(BOURBONS);
    player.gx = 4; player.gy = ROW_HOME; player.bestGy = ROW_HOME;
    snapPlayerPixels();
    initLanes();
    fx.intensity = 0; fx.target = 0;
    els.phaseTag.textContent = "HEADING TO THE 7-ELEVEN";
    updateHud();
  }
  function startGame() {
    ensureAudio();
    resetRun();
    state.mode = "playing";
    els.startOverlay.classList.add("hidden");
    els.overOverlay.classList.add("hidden");
    els.winOverlay.classList.add("hidden");
    els.shareBluesky.style.display = "none";
  }
  function respawn() {
    player.gx = 4;
    player.gy = state.phase === "to7" ? ROW_HOME : ROW_STORE;
    player.bestGy = player.gy;
    snapPlayerPixels();
    state.invuln = 1.4;
  }
  function loseLife() {
    if (state.invuln > 0) return;
    sfxCrash();
    state.lives--;
    updateHud();
    if (state.lives <= 0) {
      state.mode = "over";
      els.overLine.textContent = pick([
        "A Honda full of rowdy students did not stop.",
        "Someone's pledge-week driving ends your crossing early.",
        "Bass, headlights, then nothing. The math department will hear about this.",
        "You got clipped two feet from the median.",
      ]);
      els.finalScore.textContent = state.score;
      sfxOver();
      els.overOverlay.classList.remove("hidden");
    } else {
      respawn();
    }
  }
  function reachStore() {
    state.mode = "buy";
    state.score += 150;
    updateHud();
    els.buyLine.textContent = state.bourbon.line;
    sfxBuy();
    els.buyOverlay.classList.remove("hidden");
  }
  function continueHome() {
    state.mode = "playing";
    state.phase = "home";
    player.bestGy = ROW_STORE;
    fx.target = 1;
    els.phaseTag.textContent = "WALKING HOME (CAREFULLY)";
    els.buyOverlay.classList.add("hidden");
  }
  function reachHome() {
    state.mode = "win";
    const timeBonus = Math.max(0, Math.round((45 - state.elapsed) * 4));
    state.score += 300 + timeBonus;
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem("pigger-best", String(state.best)); } catch (e) {}
    }
    updateHud();
    els.winLine.textContent = pick([
      "The bottle survived. So did you, technically.",
      "Nash Lane: 0. A doctor of mathematics with a paper bag: 1.",
      "You made it home. The shaders were, in retrospect, a lot.",
    ]);
    els.winScore.textContent = state.score;
    els.winTime.textContent = state.elapsed.toFixed(1);
    sfxWin();
    els.winOverlay.classList.remove("hidden");
    buildShare();
  }
  function updateHud() {
    els.score.textContent = state.score;
    els.best.textContent = Math.max(state.best, state.score);
    els.time.textContent = state.elapsed.toFixed(1);
    els.lives.textContent = "🐷".repeat(Math.max(0, state.lives)) + "·".repeat(Math.max(0, 3 - state.lives));
  }

  els.startBtn.addEventListener("click", startGame);
  els.buyContinueBtn.addEventListener("click", continueHome);
  els.againBtn.addEventListener("click", startGame);
  els.restartBtn.addEventListener("click", startGame);

  // ---------- collision ----------
  function checkCollision() {
    if (state.invuln > 0) return;
    if (player.gy !== ROW_STORE && player.gy !== ROW_HOME && player.gy !== ROW_MEDIAN) {
      const lane = lanes.find((l) => l.row === player.gy);
      if (lane) {
        const pw = 34, ph = 40;
        const pl = player.px - pw / 2, pr = player.px + pw / 2;
        for (const car of lane.cars) {
          const cl = car.x - lane.carW / 2, cr = car.x + lane.carW / 2;
          if (pr > cl && pl < cr) { loseLife(); return; }
        }
      }
    }
  }

  // ---------- draw: background ----------
  function drawSidewalk(y, brick) {
    bctx.fillStyle = brick ? "#5a3d3d" : "#c9b696";
    bctx.fillRect(0, y, WIDTH, TILE);
    bctx.strokeStyle = "rgba(0,0,0,0.18)";
    bctx.lineWidth = 2;
    for (let x = 0; x <= WIDTH; x += 32) {
      bctx.beginPath(); bctx.moveTo(x, y); bctx.lineTo(x, y + TILE); bctx.stroke();
    }
  }
  function drawStoreRow() {
    const y = ROW_STORE * TILE;
    const curbH = 10;
    // striped awning across the top
    const stripeColors = ["#d94f2b", "#f2f0e6", "#2a9d8f"];
    const sw = 36;
    for (let i = 0; i * sw < WIDTH; i++) {
      bctx.fillStyle = stripeColors[i % 3];
      bctx.fillRect(i * sw, y, sw, 14);
    }
    // storefront wall
    bctx.fillStyle = "#171010";
    bctx.fillRect(0, y + 14, WIDTH, TILE - 14 - curbH);
    // door + windows
    bctx.fillStyle = "#0e2a2a";
    bctx.fillRect(WIDTH / 2 - 46, y + 20, 92, TILE - 24 - curbH);
    bctx.strokeStyle = "rgba(255,255,255,0.25)"; bctx.lineWidth = 2;
    bctx.strokeRect(WIDTH / 2 - 46, y + 20, 92, TILE - 24 - curbH);
    // sign
    bctx.fillStyle = "#d94f2b";
    bctx.fillRect(WIDTH / 2 - 70, y + 22, 140, 18);
    bctx.fillStyle = "#f2f0e6";
    bctx.font = "bold 12px ui-monospace, monospace";
    bctx.textAlign = "center";
    bctx.fillText("7-ELEVEN", WIDTH / 2, y + 35);
    bctx.textAlign = "left";
    // curb strip at the bottom of the row
    bctx.fillStyle = "#c9b696";
    bctx.fillRect(0, y + TILE - curbH, WIDTH, curbH);
    bctx.strokeStyle = "rgba(0,0,0,0.18)"; bctx.lineWidth = 2;
    for (let x = 0; x <= WIDTH; x += 32) {
      bctx.beginPath(); bctx.moveTo(x, y + TILE - curbH); bctx.lineTo(x, y + TILE); bctx.stroke();
    }
  }
  function drawHomeRow() {
    const y = ROW_HOME * TILE;
    drawSidewalk(y, true);
    bctx.fillStyle = "#3a2626";
    bctx.fillRect(0, y - 6, WIDTH, 6);
    bctx.fillStyle = "#8a6a4a";
    bctx.fillRect(WIDTH / 2 - 30, y + 8, 60, TILE - 14);
    bctx.fillStyle = "#ffd97a";
    bctx.globalAlpha = 0.85;
    bctx.fillRect(WIDTH / 2 - 20, y + 16, 14, 14);
    bctx.fillRect(WIDTH / 2 + 6, y + 16, 14, 14);
    bctx.globalAlpha = 1;
    bctx.fillStyle = "#d9c9a8";
    bctx.font = "bold 10px ui-monospace, monospace";
    bctx.fillText("NASH LANE", 6, y + TILE - 6);
  }
  function drawMedianRow() {
    const y = ROW_MEDIAN * TILE;
    bctx.fillStyle = "#2f4d33";
    bctx.fillRect(0, y, WIDTH, TILE);
    bctx.fillStyle = "#3f6644";
    for (let x = 6; x < WIDTH; x += 26) {
      bctx.fillRect(x, y + 10, 14, TILE - 20);
    }
    bctx.strokeStyle = "rgba(0,0,0,0.25)"; bctx.lineWidth = 3;
    bctx.strokeRect(0, y + 2, WIDTH, TILE - 4);
  }
  function drawRoadRow(row) {
    const y = row * TILE;
    bctx.fillStyle = "#232026";
    bctx.fillRect(0, y, WIDTH, TILE);
    bctx.strokeStyle = "rgba(255,255,255,0.35)";
    bctx.setLineDash([16, 14]);
    bctx.lineWidth = 3;
    bctx.beginPath(); bctx.moveTo(0, y + TILE / 2); bctx.lineTo(WIDTH, y + TILE / 2); bctx.stroke();
    bctx.setLineDash([]);
  }
  function drawBackground() {
    for (let r = 0; r < ROWS; r++) {
      if (r === ROW_STORE) drawStoreRow();
      else if (r === ROW_HOME) drawHomeRow();
      else if (r === ROW_MEDIAN) drawMedianRow();
      else drawRoadRow(r);
    }
  }

  function drawCars() {
    for (const lane of lanes) {
      const y = lane.row * TILE + TILE / 2;
      for (const car of lane.cars) {
        const w = lane.carW, h = lane.carH;
        const facingRight = lane.dir > 0;
        bctx.save();
        bctx.translate(car.x, y);
        if (!facingRight) bctx.scale(-1, 1);
        bctx.fillStyle = lane.colors[car.colorIdx];
        roundRect(bctx, -w / 2, -h / 2, w, h, 8);
        bctx.fill();
        // windshield
        bctx.fillStyle = "rgba(210,230,255,0.7)";
        roundRect(bctx, w / 2 - 20, -h / 2 + 5, 12, h - 10, 3);
        bctx.fill();
        // headlight/taillight
        bctx.fillStyle = "#fff3c4";
        bctx.fillRect(w / 2 - 4, -h / 2 + 5, 4, 7);
        bctx.fillRect(w / 2 - 4, h / 2 - 12, 4, 7);
        bctx.fillStyle = "#ff5d73";
        bctx.fillRect(-w / 2, -h / 2 + 5, 3, 7);
        bctx.fillRect(-w / 2, h / 2 - 12, 3, 7);
        bctx.restore();
        // rowdy bass-wave squiggle behind fast cars
        if (lane.speed > 140) {
          const bx = car.x - (facingRight ? w / 2 + 14 : -(w / 2 + 14));
          bctx.strokeStyle = "rgba(255,255,255,0.28)";
          bctx.lineWidth = 2;
          bctx.beginPath();
          for (let i = -10; i <= 10; i += 2) {
            const yy = y + Math.sin((i + car.wobble + Date.now() / 90) * 0.9) * 8;
            if (i === -10) bctx.moveTo(bx, yy); else bctx.lineTo(bx + (facingRight ? -i - 10 : i + 10), yy);
          }
          bctx.stroke();
        }
      }
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlayer() {
    const flash = state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0;
    if (flash) return;
    const x = player.px, y = player.py;
    bctx.save();
    bctx.translate(x, y);
    if (player.facing === "left") bctx.scale(-1, 1);
    // legs / trotters
    bctx.fillStyle = "#caa9a0";
    bctx.fillRect(-12, 14, 8, 10);
    bctx.fillRect(4, 14, 8, 10);
    // lab coat body (big & burly)
    bctx.fillStyle = "#f4f1e8";
    roundRect(bctx, -18, -8, 36, 26, 8);
    bctx.fill();
    bctx.strokeStyle = "#d8d2c2"; bctx.lineWidth = 2; bctx.stroke();
    // pi patch — doctor of mathematics
    bctx.fillStyle = "#7c6cff";
    bctx.font = "bold 11px ui-monospace, monospace";
    bctx.fillText("π", -3, 8);
    // arms, hairy
    bctx.strokeStyle = "#8a6a52"; bctx.lineWidth = 3;
    bctx.beginPath(); bctx.moveTo(-18, 0); bctx.lineTo(-24, 10); bctx.stroke();
    bctx.beginPath(); bctx.moveTo(18, 0); bctx.lineTo(24, 10); bctx.stroke();
    // bag + bottle on the way home
    if (state.phase === "home") {
      bctx.fillStyle = "#b98a4a";
      bctx.fillRect(16, -2, 12, 16);
      bctx.fillStyle = "#3a2a1a";
      bctx.fillRect(19, -12, 6, 12);
    }
    // head — pink pig, hairy tufts
    bctx.fillStyle = "#e8a2a0";
    bctx.beginPath(); bctx.arc(0, -20, 15, 0, Math.PI * 2); bctx.fill();
    // ears
    bctx.fillStyle = "#d98684";
    bctx.beginPath(); bctx.ellipse(-11, -30, 6, 9, -0.5, 0, Math.PI * 2); bctx.fill();
    bctx.beginPath(); bctx.ellipse(11, -30, 6, 9, 0.5, 0, Math.PI * 2); bctx.fill();
    // hair tufts
    bctx.strokeStyle = "#4a3a2a"; bctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      bctx.beginPath();
      bctx.moveTo(i * 5, -33);
      bctx.lineTo(i * 5 + (i < 0 ? -2 : 2), -39);
      bctx.stroke();
    }
    // snout
    bctx.fillStyle = "#d98684";
    roundRect(bctx, -7, -18, 14, 10, 4);
    bctx.fill();
    bctx.fillStyle = "#7a4a48";
    bctx.beginPath(); bctx.arc(-3, -13, 1.4, 0, Math.PI * 2); bctx.fill();
    bctx.beginPath(); bctx.arc(3, -13, 1.4, 0, Math.PI * 2); bctx.fill();
    // glasses — a doctor of mathematics
    bctx.strokeStyle = "#221a14"; bctx.lineWidth = 1.6;
    bctx.beginPath(); bctx.arc(-6, -22, 4.5, 0, Math.PI * 2); bctx.stroke();
    bctx.beginPath(); bctx.arc(6, -22, 4.5, 0, Math.PI * 2); bctx.stroke();
    bctx.beginPath(); bctx.moveTo(-1.5, -22); bctx.lineTo(1.5, -22); bctx.stroke();
    bctx.restore();
  }

  function drawFrame() {
    bctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawCars();
    drawPlayer();
  }

  // ---------- webgl post-process (the "extra groovy shaders and vertigo") ----------
  const fxCanvas = document.getElementById("fx");
  const fx = { t: 0, intensity: 0, target: 0, ready: false };
  let gl, prog, uTex, uTime, uIntensity, texture;
  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      vUv.y = 1.0 - vUv.y;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;
  const FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uTime;
    uniform float uIntensity;

    vec3 hueShift(vec3 c, float a) {
      float u = cos(a), w = sin(a);
      mat3 m = mat3(
        0.299 + 0.701*u + 0.168*w, 0.587 - 0.587*u + 0.330*w, 0.114 - 0.114*u - 0.497*w,
        0.299 - 0.299*u - 0.328*w, 0.587 + 0.413*u + 0.035*w, 0.114 - 0.114*u + 0.292*w,
        0.299 - 0.300*u + 1.250*w, 0.587 - 0.588*u - 1.050*w, 0.114 + 0.886*u - 0.203*w
      );
      return clamp(m * c, 0.0, 1.0);
    }

    void main() {
      float i = uIntensity;
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float zoom = 1.0 + sin(uTime * 1.7) * 0.02 * i;
      uv = 0.5 + c * zoom;
      uv.x += sin(uv.y * 22.0 + uTime * 2.6) * 0.012 * i;
      uv.y += cos(uv.x * 17.0 + uTime * 2.1) * 0.010 * i;

      float ab = 0.006 * i;
      vec2 dir = normalize(c + 0.0001) * ab;
      float r = texture2D(uTex, uv + dir).r;
      float g = texture2D(uTex, uv).g;
      float b = texture2D(uTex, uv - dir).b;
      vec3 col = vec3(r, g, b);

      col = hueShift(col, uTime * 0.6 * i);

      float vig = smoothstep(0.9, 0.25, length(c)) ;
      col *= mix(1.0, vig, 0.35 * i);

      float grain = (fract(sin(dot(uv * uTime, vec2(12.9898,78.233))) * 43758.5453) - 0.5) * 0.06 * i;
      col += grain;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`;
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("pigger shader compile error", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  function initGl() {
    gl = fxCanvas.getContext("webgl", { antialias: false, alpha: false }) ||
         fxCanvas.getContext("experimental-webgl");
    if (!gl) return false;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    uTex = gl.getUniformLocation(prog, "uTex");
    uTime = gl.getUniformLocation(prog, "uTime");
    uIntensity = gl.getUniformLocation(prog, "uIntensity");
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.viewport(0, 0, fxCanvas.width, fxCanvas.height);
    return true;
  }
  let fx2d = null;
  fx.ready = initGl();
  if (!fx.ready) fx2d = fxCanvas.getContext("2d");

  function renderFx(dt) {
    fx.t += dt;
    fx.intensity += (fx.target - fx.intensity) * Math.min(1, dt * 1.4);
    const breathing = fx.target > 0 ? (0.8 + 0.2 * Math.sin(fx.t * 0.9)) : 1;
    const shown = Math.max(0, fx.intensity * breathing);
    if (fx.ready) {
      gl.useProgram(prog);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
      gl.uniform1i(uTex, 0);
      gl.uniform1f(uTime, fx.t);
      gl.uniform1f(uIntensity, shown);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (fx2d) {
      fx2d.drawImage(buffer, 0, 0);
    }
    // screen sway on the stage element — the "vertigo" half of the effect
    if (shown > 0.01) {
      const dx = Math.sin(fx.t * 1.3) * 4 * shown;
      const dy = Math.cos(fx.t * 1.7) * 3 * shown;
      const rot = Math.sin(fx.t * 0.8) * 0.8 * shown;
      stage.style.transform = `translate(${dx}px,${dy}px) rotate(${rot}deg)`;
    } else {
      stage.style.transform = "";
    }
  }

  // ---------- share card ----------
  function buildShare() {
    const url = "https://pigger.bisks.net/";
    const text = `Crossed Nash Lane and back as a pigman doctor of mathematics for a bottle of ${state.bourbon.name}. Score ${state.score} in ${state.elapsed.toFixed(1)}s. ${url}`;
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
    els.shareBluesky.style.display = "inline-block";
    drawShareCard();
  }
  function drawShareCard() {
    const card = document.getElementById("shareCard");
    const c = card.getContext("2d");
    const W = card.width, H = card.height;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#120d1a"); g.addColorStop(1, "#241733");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // scaled-up snapshot of the buffer canvas as backdrop, dimmed
    c.globalAlpha = 0.55;
    c.drawImage(buffer, 0, 0, buffer.width, buffer.height, W - 560, 40, 520, 462);
    c.globalAlpha = 1;
    c.fillStyle = "#ff8a3d";
    c.font = "bold 64px ui-monospace, monospace";
    c.fillText("PIGGER", 60, 120);
    c.fillStyle = "#f2e9da";
    c.font = "20px ui-monospace, monospace";
    c.fillText("crossed Nash Lane and back for a 40", 60, 158);
    c.fillStyle = "#7fd8c8";
    c.font = "bold 40px ui-monospace, monospace";
    c.fillText("score " + state.score, 60, 260);
    c.font = "24px ui-monospace, monospace";
    c.fillStyle = "#f2e9da";
    c.fillText(state.elapsed.toFixed(1) + "s crossing time", 60, 300);
    c.font = "16px ui-monospace, monospace";
    c.fillStyle = "rgba(242,233,218,0.7)";
    const words = state.bourbon.line;
    c.fillText(words.length > 60 ? words.slice(0, 57) + "..." : words, 60, 340);
    c.fillStyle = "#ff8a3d";
    c.font = "bold 20px ui-monospace, monospace";
    c.fillText("pigger.bisks.net", 60, H - 40);
  }
  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (e) { return false; }
  }
  els.shareBtn.addEventListener("click", async () => {
    const card = document.getElementById("shareCard");
    const text = els.shareBluesky.href ? decodeURIComponent(els.shareBluesky.href.split("text=")[1]) : "";
    card.toBlob(async (blob) => {
      if (!blob) return;
      if (canShareFiles()) {
        try {
          const file = new File([blob], "pigger.png", { type: "image/png" });
          await navigator.share({ files: [file], text, title: "PIGGER" });
          return;
        } catch (e) { /* fall through to download */ }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pigger-crossing.png";
      a.click();
      window.open(els.shareBluesky.href, "_blank", "noopener");
    }, "image/png");
  });

  // ---------- main loop ----------
  let lastT = performance.now();
  function frame(now) {
    let dt = (now - lastT) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastT = now;

    if (state.mode === "playing") {
      state.elapsed += dt;
      state.invuln = Math.max(0, state.invuln - dt);
      updateLanes(dt);
      if (player.moving) {
        player.t += dt / player.dur;
        if (player.t >= 1) {
          player.t = 1; player.moving = false;
          player.px = player.toX; player.py = player.toY;
          if (state.phase === "to7" && player.gy === ROW_STORE) reachStore();
          else if (state.phase === "home" && player.gy === ROW_HOME) reachHome();
        } else {
          player.px = player.fromX + (player.toX - player.fromX) * player.t;
          player.py = player.fromY + (player.toY - player.fromY) * player.t;
        }
      }
      checkCollision();
      if (state.mode === "playing" && Math.floor(state.elapsed * 5) !== Math.floor((state.elapsed - dt) * 5)) {
        updateHud();
      }
    }
    drawFrame();
    renderFx(state.mode === "playing" || state.mode === "buy" ? dt : dt * 0.4);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

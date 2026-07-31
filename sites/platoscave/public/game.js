// PLATO'S CAVE — a Y2K flash-portal simulator of the Allegory of the Cave.
// One canvas, five acts: guess the shadow puppets while chained, snap the
// chain and mash your way up the tunnel, get blinded by the Forms, climb
// back down and dodge the rocks the other prisoners throw at you for your
// trouble. No frameworks, no build step — just canvas, Web Audio, and a
// deliberately crude late-90s vector aesthetic.

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const el = (id) => document.getElementById(id);
  const scoreEl = el("score");
  const faithEl = el("faith");
  const splashOverlay = el("splashOverlay");
  const loadLog = el("loadLog");
  const loadBarInner = el("loadBarInner");
  const loadPct = el("loadPct");
  const enterBtn = el("enterBtn");
  const skipBtn = el("skipBtn");
  const storyOverlay = el("storyOverlay");
  const storyTitle = el("storyTitle");
  const storyText = el("storyText");
  const storyBtn = el("storyBtn");
  const resultsOverlay = el("resultsOverlay");
  const resultsTitle = el("resultsTitle");
  const resultsText = el("resultsText");
  const shareCanvas = el("shareCanvas");
  const shareBtn = el("shareBtn");
  const downloadBtn = el("downloadBtn");
  const againBtn = el("againBtn");
  const choicesWrap = el("choices");
  const choiceButtons = Array.from(document.querySelectorAll(".choice-btn"));
  const moveControls = el("moveControls");
  const leftBtn = el("leftBtn");
  const actionBtn = el("actionBtn");
  const rightBtn = el("rightBtn");
  const hitcounterEl = el("hitcounter");
  const guestbookLink = el("guestbookLink");

  const SITE_URL = "https://platoscave.bisks.net/";

  // ---------- audio: everything synthesized, nothing shipped as a file ----------
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    } else if (actx.state === "suspended") {
      actx.resume();
    }
  }

  function beep(freq, dur, type = "square", vol = 0.16, delay = 0, glideTo = null) {
    if (!actx) return;
    const t0 = actx.currentTime + delay;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseThud(dur = 0.18, vol = 0.22, delay = 0) {
    if (!actx) return;
    const t0 = actx.currentTime + delay;
    const bufferSize = Math.floor(actx.sampleRate * dur);
    const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = actx.createBufferSource();
    src.buffer = buffer;
    const gain = actx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const filt = actx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 900;
    src.connect(filt).connect(gain).connect(actx.destination);
    src.start(t0);
  }

  function sfxCorrect() {
    beep(392, 0.09, "square", 0.16, 0);
    beep(523, 0.09, "square", 0.16, 0.09);
    beep(784, 0.15, "square", 0.18, 0.18);
  }
  function sfxWrong() {
    beep(180, 0.22, "sawtooth", 0.18, 0, 90);
  }
  function sfxClimb() { beep(300 + Math.random() * 80, 0.05, "square", 0.12, 0); }
  function sfxHit() { noiseThud(0.16, 0.24, 0); beep(120, 0.1, "square", 0.1, 0); }
  function sfxWin() {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, "square", 0.16, i * 0.11));
  }
  function sfxLose() {
    [392, 349, 293, 220].forEach((f, i) => beep(f, 0.2, "sawtooth", 0.14, i * 0.13));
  }

  // tiny background sequencer — a different loop per act, all oscillators
  let musicTimer = null;
  function stopMusic() { if (musicTimer) clearTimeout(musicTimer); musicTimer = null; }
  function playMusic(pattern, tempoMs, waveform) {
    stopMusic();
    let i = 0;
    const step = () => {
      if (!actx) { musicTimer = setTimeout(step, tempoMs); return; }
      const note = pattern[i % pattern.length];
      if (note) beep(note, tempoMs / 1000 * 0.85, waveform, 0.06, 0);
      i++;
      musicTimer = setTimeout(step, tempoMs);
    };
    step();
  }
  const MUSIC = {
    cave: [130.8, 0, 155.6, 0, 130.8, 0, 98.0, 0],
    climb: [196, 220, 246.9, 220, 261.6, 220, 246.9, 220],
    forms: [523.3, 0, 659.3, 0, 784, 0, 659.3, 0],
    ret: [146.8, 174.6, 146.8, 196, 174.6, 146.8, 130.8, 174.6],
  };

  // ---------- hit counter, pure nostalgia ----------
  (function hitCounter() {
    let n = 1337;
    try {
      const stored = localStorage.getItem("platoscave-hits");
      n = stored ? parseInt(stored, 10) + 1 : 1337;
    } catch (e) {}
    try { localStorage.setItem("platoscave-hits", String(n)); } catch (e) {}
    hitcounterEl.textContent = String(n).padStart(7, "0");
  })();

  guestbookLink.addEventListener("click", (e) => {
    e.preventDefault();
    toast("the guestbook is full. it was always full. try again in 2002.");
  });

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.cssText =
        "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
        "background:#000;color:#ffd23f;border:2px solid #ff2fd6;padding:8px 14px;" +
        "border-radius:4px;font-size:12px;z-index:9999;box-shadow:0 0 14px #ff2fd6;" +
        "font-family:ui-monospace,monospace;max-width:80vw;text-align:center;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = "none"; }, 2400);
  }

  // ---------- fake loading screen ----------
  const LOAD_LINES = [
    "mounting fire.swf ......... OK",
    "compiling shadows.fla ..... OK",
    "unpacking allegory.zip .... OK",
    "initializing chains.dll ... OK",
    "connecting to forms.exe ... OK",
    "buffering wisdom.mp3 ...... OK",
  ];
  let loadDone = false;
  function runLoading(instant) {
    loadLog.innerHTML = "";
    let pct = 0;
    let lineIdx = 0;
    const totalMs = instant ? 0 : 2600 + Math.random() * 900;
    const start = performance.now();
    function frame(now) {
      if (loadDone) return;
      const t = instant ? 1 : Math.min(1, (now - start) / totalMs);
      pct = Math.floor(t * 100 * (0.85 + Math.random() * 0.15));
      pct = Math.min(100, pct);
      loadBarInner.style.width = pct + "%";
      loadPct.textContent = "LOADING ASSETS... " + Math.min(100, pct) + "%";
      const wantLines = Math.floor(t * LOAD_LINES.length);
      while (lineIdx < wantLines && lineIdx < LOAD_LINES.length) {
        const d = document.createElement("div");
        d.textContent = "> " + LOAD_LINES[lineIdx];
        loadLog.appendChild(d);
        lineIdx++;
      }
      if (t >= 1) {
        while (lineIdx < LOAD_LINES.length) {
          const d = document.createElement("div");
          d.textContent = "> " + LOAD_LINES[lineIdx];
          loadLog.appendChild(d);
          lineIdx++;
        }
        loadBarInner.style.width = "100%";
        loadPct.textContent = "LOADING ASSETS... 100% — READY";
        loadDone = true;
        enterBtn.disabled = false;
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  runLoading(false);
  skipBtn.addEventListener("click", () => { loadDone = false; runLoading(true); });

  // ---------- shared game state ----------
  let score = 0;
  let faith = 3; // 0..3, cosmetic — flavors the ending, never blocks progress
  function addScore(n) { score += n; scoreEl.textContent = String(score); }
  function setFaith(n) {
    faith = Math.max(0, Math.min(3, n));
    faithEl.textContent = "♥".repeat(faith) + "♡".repeat(3 - faith);
  }
  setFaith(3);

  let scene = "splash"; // splash | cave | climb | forms | return | results
  let last = performance.now();

  // input state
  const keys = { left: false, right: false };
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") { keys.left = true; }
    if (e.code === "ArrowRight") { keys.right = true; }
    if (e.code === "Space") {
      if (scene === "climb") { e.preventDefault(); climbPress(); }
    }
    if (scene === "cave" && /^Digit[1-4]$/.test(e.code)) {
      const idx = parseInt(e.code.slice(5), 10) - 1;
      chooseCave(idx);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft") keys.left = false;
    if (e.code === "ArrowRight") keys.right = false;
  });
  leftBtn.addEventListener("pointerdown", () => { keys.left = true; });
  leftBtn.addEventListener("pointerup", () => { keys.left = false; });
  leftBtn.addEventListener("pointerleave", () => { keys.left = false; });
  rightBtn.addEventListener("pointerdown", () => { keys.right = true; });
  rightBtn.addEventListener("pointerup", () => { keys.right = false; });
  rightBtn.addEventListener("pointerleave", () => { keys.right = false; });
  actionBtn.addEventListener("pointerdown", () => { if (scene === "climb") climbPress(); });

  // ---------- shadow-puppet shape library ----------
  const SHAPES = [
    { name: "HORSE", draw(cx, cy, s) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46 * s, 20 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      poly([[cx - 40 * s, cy - 10 * s], [cx - 62 * s, cy - 40 * s], [cx - 48 * s, cy - 6 * s]]);
      ctx.fillRect(cx - 34 * s, cy + 8 * s, 10 * s, 30 * s);
      ctx.fillRect(cx + 22 * s, cy + 8 * s, 10 * s, 30 * s);
      poly([[cx + 44 * s, cy - 6 * s], [cx + 64 * s, cy - 2 * s], [cx + 44 * s, cy + 10 * s]]);
    } },
    { name: "BIRD", draw(cx, cy, s) {
      ctx.beginPath(); ctx.ellipse(cx, cy, 24 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fill();
      poly([[cx - 60 * s, cy - 30 * s], [cx, cy - 2 * s], [cx - 50 * s, cy + 6 * s]]);
      poly([[cx + 60 * s, cy - 26 * s], [cx, cy], [cx + 52 * s, cy + 10 * s]]);
      poly([[cx + 22 * s, cy - 8 * s], [cx + 38 * s, cy - 16 * s], [cx + 28 * s, cy + 2 * s]]);
    } },
    { name: "URN", draw(cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx - 18 * s, cy + 34 * s);
      ctx.bezierCurveTo(cx - 30 * s, cy + 10 * s, cx - 30 * s, cy - 22 * s, cx - 12 * s, cy - 34 * s);
      ctx.bezierCurveTo(cx - 4 * s, cy - 40 * s, cx + 4 * s, cy - 40 * s, cx + 12 * s, cy - 34 * s);
      ctx.bezierCurveTo(cx + 30 * s, cy - 22 * s, cx + 30 * s, cy + 10 * s, cx + 18 * s, cy + 34 * s);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy - 36 * s, 10 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
    } },
    { name: "TREE", draw(cx, cy, s) {
      poly([[cx - 30 * s, cy], [cx, cy - 46 * s], [cx + 30 * s, cy]]);
      poly([[cx - 22 * s, cy - 16 * s], [cx, cy - 56 * s], [cx + 22 * s, cy - 16 * s]]);
      ctx.fillRect(cx - 6 * s, cy, 12 * s, 26 * s);
    } },
    { name: "FISH", draw(cx, cy, s) {
      ctx.beginPath(); ctx.ellipse(cx - 6 * s, cy, 34 * s, 18 * s, 0, 0, Math.PI * 2); ctx.fill();
      poly([[cx + 26 * s, cy - 16 * s], [cx + 50 * s, cy], [cx + 26 * s, cy + 16 * s]]);
      poly([[cx - 10 * s, cy - 16 * s], [cx - 2 * s, cy - 30 * s], [cx + 6 * s, cy - 16 * s]]);
    } },
    { name: "CROWN", draw(cx, cy, s) {
      ctx.fillRect(cx - 34 * s, cy, 68 * s, 16 * s);
      poly([[cx - 34 * s, cy], [cx - 22 * s, cy - 30 * s], [cx - 10 * s, cy]]);
      poly([[cx - 12 * s, cy], [cx, cy - 40 * s], [cx + 12 * s, cy]]);
      poly([[cx + 10 * s, cy], [cx + 22 * s, cy - 30 * s], [cx + 34 * s, cy]]);
    } },
    { name: "KEY", draw(cx, cy, s) {
      ctx.beginPath(); ctx.arc(cx - 24 * s, cy, 16 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 24 * s, cy, 7 * s, 0, Math.PI * 2, true);
      ctx.fillRect(cx - 10 * s, cy - 5 * s, 46 * s, 10 * s);
      ctx.fillRect(cx + 20 * s, cy + 5 * s, 8 * s, 12 * s);
      ctx.fillRect(cx + 32 * s, cy + 5 * s, 8 * s, 18 * s);
    } },
    { name: "SNAKE", draw(cx, cy, s) {
      ctx.lineWidth = 14 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 50 * s, cy + 20 * s);
      ctx.bezierCurveTo(cx - 20 * s, cy - 30 * s, cx + 10 * s, cy + 30 * s, cx + 40 * s, cy - 10 * s);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 48 * s, cy - 16 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
    } },
  ];
  function poly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- fire particles, used in cave + return acts ----------
  let embers = [];
  function spawnEmbers(dt, cx, baseY) {
    if (Math.random() < dt * 26) {
      embers.push({
        x: cx + (Math.random() - 0.5) * 34,
        y: baseY,
        vy: -40 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 16,
        life: 0.5 + Math.random() * 0.6,
        age: 0,
        r: 1.5 + Math.random() * 2,
      });
    }
    for (const e of embers) {
      e.age += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    embers = embers.filter((e) => e.age < e.life);
  }
  function drawEmbers() {
    for (const e of embers) {
      const a = 1 - e.age / e.life;
      ctx.fillStyle = `rgba(255,${140 + Math.floor(Math.random() * 60)},60,${a})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawFire(cx, baseY, flick) {
    const h = 60 + Math.sin(flick * 9) * 6;
    ctx.fillStyle = "#ff8a1e";
    poly([[cx - 22, baseY], [cx - 30, baseY - h * 0.5], [cx - 6, baseY - h], [cx + 8, baseY - h * 0.65], [cx + 26, baseY - h * 0.3], [cx + 6, baseY - h * 0.15], [cx + 16, baseY]]);
    ctx.fillStyle = "#ffd23f";
    const h2 = h * 0.6 + Math.sin(flick * 13) * 4;
    poly([[cx - 10, baseY], [cx - 14, baseY - h2 * 0.6], [cx - 2, baseY - h2], [cx + 8, baseY - h2 * 0.5], [cx + 10, baseY]]);
  }

  // ---------- scene transition helper ----------
  function showStory(title, text, btnLabel, onContinue) {
    stopMusic();
    storyTitle.textContent = title;
    storyText.textContent = text;
    storyBtn.textContent = btnLabel;
    storyOverlay.classList.remove("hidden");
    choicesWrap.classList.add("hidden");
    moveControls.classList.add("hidden");
    const handler = () => {
      storyOverlay.classList.add("hidden");
      storyBtn.removeEventListener("click", handler);
      onContinue();
    };
    storyBtn.addEventListener("click", handler);
  }

  // ================= ACT 1: THE CAVE (shadow-guessing) =================
  const CAVE_ROUNDS = 6;
  const ROUND_TIME = 6.0;
  let caveRound = 0, caveShape = null, caveTimer = 0, caveActive = false, caveStreak = 0;
  let caveFlash = 0, caveFlashColor = "";

  function enterCave() {
    scene = "cave";
    caveRound = 0;
    caveStreak = 0;
    choicesWrap.classList.remove("hidden");
    moveControls.classList.add("hidden");
    playMusic(MUSIC.cave, 340, "triangle");
    nextCaveRound();
  }

  function nextCaveRound() {
    caveRound++;
    if (caveRound > CAVE_ROUNDS) {
      choicesWrap.classList.add("hidden");
      showStory(
        "THE CHAIN GIVES WAY",
        "Something behind you groans and snaps — a link worn thin by " + CAVE_ROUNDS +
        " rounds of staring at shapes on a wall. Nobody chained beside you moves. " +
        "You could stay. Nobody would blame you.",
        "STAND UP ▶",
        enterClimb
      );
      return;
    }
    const idx = Math.floor(Math.random() * SHAPES.length);
    caveShape = SHAPES[idx];
    const pool = SHAPES.filter((s) => s !== caveShape);
    const distractors = [];
    while (distractors.length < 3) {
      const d = pool[Math.floor(Math.random() * pool.length)];
      if (!distractors.includes(d)) distractors.push(d);
    }
    const options = [caveShape, ...distractors].sort(() => Math.random() - 0.5);
    choiceButtons.forEach((btn, i) => {
      btn.textContent = options[i].name;
      btn.dataset.answer = options[i].name;
      btn.classList.remove("correct", "wrong");
      btn.disabled = false;
    });
    caveTimer = ROUND_TIME;
    caveActive = true;
  }

  function chooseCave(idx) {
    if (!caveActive || scene !== "cave") return;
    caveActive = false;
    const btn = choiceButtons[idx];
    const correct = btn.dataset.answer === caveShape.name;
    choiceButtons.forEach((b) => {
      b.disabled = true;
      if (b.dataset.answer === caveShape.name) b.classList.add("correct");
    });
    if (correct) {
      caveStreak++;
      addScore(100 + caveStreak * 20);
      sfxCorrect();
      caveFlash = 0.4; caveFlashColor = "125,255,176";
    } else {
      btn.classList.add("wrong");
      caveStreak = 0;
      setFaith(faith - 1);
      sfxWrong();
      caveFlash = 0.4; caveFlashColor = "255,93,143";
    }
    setTimeout(nextCaveRound, 850);
  }
  choiceButtons.forEach((btn, i) => btn.addEventListener("click", () => { ensureAudio(); chooseCave(i); }));

  function updateCave(dt) {
    if (caveActive) {
      caveTimer -= dt;
      if (caveTimer <= 0) {
        caveActive = false;
        // timeout counts as a miss, but doesn't require a real button index
        choiceButtons.forEach((b) => {
          b.disabled = true;
          if (b.dataset.answer === caveShape.name) b.classList.add("correct");
        });
        setFaith(faith - 1);
        caveStreak = 0;
        sfxWrong();
        caveFlash = 0.4; caveFlashColor = "255,93,143";
        setTimeout(nextCaveRound, 850);
      }
    }
    if (caveFlash > 0) caveFlash = Math.max(0, caveFlash - dt);
    spawnEmbers(dt, W / 2, H * 0.62);
  }

  function drawCave(dt, tNow) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#241130");
    grad.addColorStop(1, "#0a0410");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // rock texture strip along the top
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let x = 0; x < W; x += 40) ctx.fillRect(x, 0, 22, 14);

    // shadow puppet on the "wall", flickering with the fire
    if (caveShape) {
      const flick = tNow * 3;
      const wob = Math.sin(flick) * 4;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "#050208";
      caveShape.draw(W / 2 + wob, H * 0.34, 2.1 + Math.sin(flick * 0.7) * 0.05);
      ctx.restore();
    }

    // low wall
    ctx.fillStyle = "#3a2848";
    ctx.fillRect(0, H * 0.68, W, 10);
    ctx.fillStyle = "#241130";
    ctx.fillRect(0, H * 0.68 + 10, W, H);

    drawFire(W / 2, H * 0.7, tNow);
    drawEmbers();

    // chained prisoners silhouette, foreground
    [W * 0.32, W * 0.5, W * 0.68].forEach((x, i) => {
      ctx.fillStyle = "#0a0410";
      ctx.beginPath();
      ctx.arc(x, H * 0.92, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 10, H * 0.92, 20, 50);
    });

    if (caveFlash > 0) {
      ctx.fillStyle = `rgba(${caveFlashColor},${caveFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    // round timer bar
    if (caveActive) {
      const frac = Math.max(0, caveTimer / ROUND_TIME);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(W / 2 - 160, 26, 320, 10);
      ctx.fillStyle = frac > 0.3 ? "#7dffb0" : "#ff5d8f";
      ctx.fillRect(W / 2 - 160, 26, 320 * frac, 10);
      ctx.fillStyle = "#fff4e0";
      ctx.font = "13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`WHAT CASTS THIS SHADOW? (round ${caveRound}/${CAVE_ROUNDS})`, W / 2, 20);
    }
  }

  // ================= ACT 2: THE CLIMB =================
  const CLIMB_TARGET = 100;
  let climbMeter = 0, climbLane = 1; // lanes 0,1,2
  let climbObstacles = [];
  let climbSpawnT = 0;
  let climbActive = false;
  let climbFlash = 0;

  function enterClimb() {
    scene = "climb";
    climbMeter = 0;
    climbLane = 1;
    climbObstacles = [];
    climbSpawnT = 0;
    climbActive = true;
    moveControls.classList.remove("hidden");
    choicesWrap.classList.add("hidden");
    playMusic(MUSIC.climb, 190, "square");
  }

  function climbPress() {
    if (!climbActive) return;
    ensureAudio();
    climbMeter = Math.min(CLIMB_TARGET, climbMeter + 7);
    sfxClimb();
  }

  function updateClimb(dt) {
    if (!climbActive) return;
    // check the win condition BEFORE decay: climbMeter is capped at CLIMB_TARGET,
    // so if this ran after decay it would always find climbMeter a hair under the
    // target and never fire — the climb would look infinite no matter how hard
    // you mashed.
    if (climbMeter >= CLIMB_TARGET) {
      climbActive = false;
      addScore(300);
      moveControls.classList.add("hidden");
      showStory(
        "YOUR HEAD BREAKS THE SURFACE",
        "Light — real light, not firelight — pours down the shaft. It is the single " +
        "worst thing that has ever happened to your eyes. You claw the last few feet anyway.",
        "OPEN YOUR EYES ▶",
        enterForms
      );
      return;
    }
    if (keys.left) climbLane = Math.max(0, climbLane - dt * 3.2);
    if (keys.right) climbLane = Math.min(2, climbLane + dt * 3.2);
    climbMeter = Math.max(0, climbMeter - dt * 3.2); // gentle decay — keep mashing

    climbSpawnT -= dt;
    if (climbSpawnT <= 0) {
      climbSpawnT = 0.9 + Math.random() * 0.6;
      climbObstacles.push({ lane: Math.floor(Math.random() * 3), y: -20, speed: 180 + Math.random() * 60 });
    }
    for (const o of climbObstacles) o.y += o.speed * dt;
    for (const o of climbObstacles) {
      if (!o.hit && o.y > H * 0.72 && o.y < H * 0.86 && Math.round(climbLane) === o.lane) {
        o.hit = true;
        climbMeter = Math.max(0, climbMeter - 10);
        climbFlash = 0.3;
        sfxHit();
      }
    }
    climbObstacles = climbObstacles.filter((o) => o.y < H + 30);
    if (climbFlash > 0) climbFlash = Math.max(0, climbFlash - dt);
  }

  function drawClimb(dt, tNow) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const glow = Math.min(1, climbMeter / CLIMB_TARGET);
    grad.addColorStop(0, `rgb(${20 + glow * 220},${16 + glow * 200},${28 + glow * 140})`);
    grad.addColorStop(1, "#0a0410");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // tunnel walls, scrolling texture
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    const scroll = (tNow * 60) % 60;
    for (let y = -60 + scroll; y < H; y += 60) {
      ctx.fillRect(W * 0.08, y, 22, 30);
      ctx.fillRect(W * 0.92 - 22, y, 22, 30);
    }

    const laneX = [W * 0.32, W * 0.5, W * 0.68];
    // obstacles: falling pebbles
    ctx.fillStyle = "#8a7f9c";
    for (const o of climbObstacles) {
      ctx.beginPath();
      ctx.arc(laneX[o.lane], o.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // player
    const realX = lerp(laneX[0], laneX[2], climbLane / 2);
    ctx.fillStyle = "#150a1c";
    ctx.beginPath();
    ctx.arc(realX, H * 0.8, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(realX - 10, H * 0.8, 20, 46);

    if (climbFlash > 0) {
      ctx.fillStyle = `rgba(255,93,143,${climbFlash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }

    // meter
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(W / 2 - 160, 26, 320, 14);
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(W / 2 - 160, 26, 320 * (climbMeter / CLIMB_TARGET), 14);
    ctx.fillStyle = "#fff4e0";
    ctx.font = "13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("MASH ▲ CLIMB · DODGE PEBBLES WITH ◀ ▶", W / 2, 20);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ================= ACT 3: THE FORMS =================
  const FORMS = [
    { name: "the Sun", desc: "the Form of the Good. never once been off by a pixel.", color: "#ffd23f", r: 46 },
    { name: "a Perfect Triangle", desc: "exactly three sides, every time, no exceptions.", color: "#2fe6ff", r: 30 },
    { name: "a Perfect Square", desc: "someone's idea of a right angle, made flesh.", color: "#ff2fd6", r: 30 },
    { name: "the Idea of a Chair", desc: "sits nobody. holds every chair that ever will.", color: "#7dffb0", r: 26 },
  ];
  let formsPositions = [];
  let formsTooltip = null;
  let formsT = 0;

  function enterForms() {
    scene = "forms";
    formsT = 0;
    formsTooltip = null;
    formsContinueShown = false;
    formsPositions = FORMS.map((f, i) => ({
      x: W * (0.22 + i * 0.2),
      y: H * (0.35 + (i % 2) * 0.28),
      phase: Math.random() * Math.PI * 2,
    }));
    playMusic(MUSIC.forms, 420, "sine");
    showStory(
      "THE SUN",
      "Your eyes ache like they've been peeled. Slowly, shapes resolve — not shadows this " +
      "time, but the things the shadows were only ever pointing at. Click around. Look at everything.",
      "LOOK ▶",
      () => {}
    );
  }

  canvas.addEventListener("click", (e) => {
    if (scene !== "forms") return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    for (let i = 0; i < FORMS.length; i++) {
      const p = formsPositions[i];
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy < FORMS[i].r * FORMS[i].r * 2.2) {
        formsTooltip = i;
        addScore(50);
        beep(660 + i * 40, 0.12, "sine", 0.14, 0);
        return;
      }
    }
  });

  function updateForms(dt) { formsT += dt; }

  function drawForms() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#8fd8ff");
    grad.addColorStop(0.5, "#ffd9a0");
    grad.addColorStop(1, "#fff4e0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    FORMS.forEach((f, i) => {
      const p = formsPositions[i];
      const y = p.y + Math.sin(formsT * 0.8 + p.phase) * 10;
      ctx.save();
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = f.color;
      if (f.name === "the Sun") {
        ctx.beginPath(); ctx.arc(p.x, y, f.r, 0, Math.PI * 2); ctx.fill();
      } else if (f.name.includes("Triangle")) {
        poly([[p.x, y - f.r], [p.x - f.r, y + f.r], [p.x + f.r, y + f.r]]);
      } else if (f.name.includes("Square")) {
        ctx.fillRect(p.x - f.r, y - f.r, f.r * 2, f.r * 2);
      } else {
        ctx.fillRect(p.x - f.r * 0.7, y - f.r, f.r * 1.4, f.r * 0.5);
        ctx.fillRect(p.x - f.r * 0.7, y - f.r * 0.5, f.r * 0.16, f.r * 1.5);
        ctx.fillRect(p.x + f.r * 0.54, y - f.r * 0.5, f.r * 0.16, f.r * 1.5);
      }
      ctx.restore();
    });

    if (formsTooltip !== null) {
      const f = FORMS[formsTooltip];
      const p = formsPositions[formsTooltip];
      ctx.font = "bold 15px ui-monospace, monospace";
      ctx.textAlign = "center";
      const label = f.name;
      const w = ctx.measureText(label).width + 24;
      ctx.fillStyle = "rgba(10,4,16,0.85)";
      ctx.fillRect(p.x - w / 2, p.y - f.r - 54, w, 44);
      ctx.fillStyle = "#ffd23f";
      ctx.fillText(label, p.x, p.y - f.r - 34);
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = "#fff4e0";
      ctx.fillText(f.desc, p.x, p.y - f.r - 18);
    }

    ctx.font = "13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(10,4,16,0.75)";
    ctx.fillText("click the Forms to behold them", W / 2, H - 16);
  }

  // continue from forms to return — triggered by a floating button drawn as DOM overlay reuse
  let formsContinueShown = false;
  function maybeShowFormsContinue() {
    if (formsContinueShown || scene !== "forms") return;
    formsContinueShown = true;
    setTimeout(() => {
      showStory(
        "THE DESCENT",
        "You have seen the Sun. You could stay up here forever, blinking. But the others " +
        "are still down there, still watching shadows, still certain the wall is everything. " +
        "You go back down to tell them.",
        "GO BACK DOWN ▶",
        enterReturn
      );
    }, 400);
  }

  // ================= ACT 4: THE RETURN (dodge the stones) =================
  const RETURN_TIME = 14;
  let returnTimeLeft = RETURN_TIME, resolve_ = 100, returnLane = 1;
  let rocks = [], rockSpawnT = 0;
  let returnActive = false;
  const QUOTES = [
    "SIT DOWN, YOU'RE BLOCKING THE WALL",
    "THERE IS NO SUCH THING AS \"OUTSIDE\"",
    "THE SHADOWS ARE FINE, ACTUALLY",
    "WHO ASKED YOU",
    "SOUNDS LIKE A YOU PROBLEM",
  ];
  let quoteIdx = 0, quoteT = 0, quoteShown = "";

  function enterReturn() {
    scene = "return";
    returnTimeLeft = RETURN_TIME;
    resolve_ = 100;
    returnLane = 1;
    rocks = [];
    rockSpawnT = 0.6;
    returnActive = true;
    quoteT = 0;
    moveControls.classList.remove("hidden");
    playMusic(MUSIC.ret, 210, "sawtooth");
  }

  function updateReturn(dt) {
    if (!returnActive) return;
    if (keys.left) returnLane = Math.max(0, returnLane - dt * 3.6);
    if (keys.right) returnLane = Math.min(2, returnLane + dt * 3.6);

    returnTimeLeft -= dt;
    quoteT -= dt;
    if (quoteT <= 0) {
      quoteT = 2.6 + Math.random() * 1.4;
      quoteShown = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    }

    rockSpawnT -= dt;
    if (rockSpawnT <= 0) {
      rockSpawnT = Math.max(0.35, 0.85 - (RETURN_TIME - returnTimeLeft) * 0.02);
      rocks.push({ lane: Math.floor(Math.random() * 3), y: H + 10, speed: 220 + Math.random() * 80 });
    }
    for (const r of rocks) r.y -= r.speed * dt;
    for (const r of rocks) {
      if (!r.hit && r.y < H * 0.86 && r.y > H * 0.7 && Math.round(returnLane) === r.lane) {
        r.hit = true;
        resolve_ = Math.max(0, resolve_ - 20);
        sfxHit();
      }
    }
    rocks = rocks.filter((r) => r.y > -20);

    spawnEmbers(dt, W * 0.5, H * 0.94);

    if (resolve_ <= 0 && returnActive) {
      returnActive = false;
      finishGame("stoned");
    } else if (returnTimeLeft <= 0 && returnActive) {
      returnActive = false;
      finishGame("enlightened");
    }
  }

  function drawReturn() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#241130");
    grad.addColorStop(1, "#0a0410");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // the seated skeptics, bottom corners, throwing
    ctx.fillStyle = "#0a0410";
    [W * 0.08, W * 0.92].forEach((x) => {
      ctx.beginPath(); ctx.arc(x, H * 0.9, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 9, H * 0.9, 18, 30);
    });

    const laneX = [W * 0.32, W * 0.5, W * 0.68];
    ctx.fillStyle = "#8a7f9c";
    for (const r of rocks) {
      ctx.beginPath();
      ctx.arc(laneX[r.lane], r.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    const realX = lerp(laneX[0], laneX[2], returnLane / 2);
    ctx.fillStyle = "#fff4e0";
    ctx.beginPath(); ctx.arc(realX, H * 0.62, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(realX - 11, H * 0.62, 22, 48);

    if (quoteShown) {
      ctx.font = "bold 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      const w = ctx.measureText(quoteShown).width + 20;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - w / 2, H * 0.18, w, 26);
      ctx.fillStyle = "#ff5d8f";
      ctx.fillText(quoteShown, W / 2, H * 0.18 + 18);
    }

    drawEmbers();

    // resolve + timer bars
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(24, 30, 220, 12);
    ctx.fillStyle = resolve_ > 40 ? "#7dffb0" : "#ff5d8f";
    ctx.fillRect(24, 30, 220 * (resolve_ / 100), 12);
    ctx.fillStyle = "#fff4e0";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("RESOLVE", 24, 26);

    ctx.textAlign = "right";
    ctx.fillText("TIME " + Math.max(0, Math.ceil(returnTimeLeft)) + "s", W - 24, 26);

    ctx.textAlign = "center";
    ctx.fillText("DODGE THE STONES · ◀ ▶", W / 2, H - 12);
  }

  // ================= RESULTS =================
  function endingCopy(kind) {
    if (kind === "stoned") {
      return {
        title: "STONED (the bad kind)",
        text: "They didn't want the sun. They wanted you to sit back down and keep guessing " +
          "shapes. You did not sit back down. This did not go well for you, but at least " +
          "you're right.",
      };
    }
    if (faith >= 2) {
      return {
        title: "ENLIGHTENMENT ACHIEVED",
        text: "You made it back. Nobody believed you, but you said it anyway, out loud, " +
          "into a room full of chained people who would rather not know. Philosophy achieved.",
      };
    }
    return {
      title: "YOU MADE IT BACK, DOUBTING",
      text: "You survived the return, but somewhere on the climb you started wondering if " +
        "the shadows weren't so bad after all. The Forms don't care. They were never " +
        "going anywhere.",
    };
  }

  function finishGame(kind) {
    scene = "results";
    stopMusic();
    if (kind === "stoned") sfxLose(); else sfxWin();
    moveControls.classList.add("hidden");
    choicesWrap.classList.add("hidden");
    const copy = endingCopy(kind);
    resultsTitle.textContent = copy.title;
    resultsText.textContent = copy.text + `  Final score: ${score}.`;
    buildShareCard(copy.title);
    const shareText =
      `I escaped Plato's Cave and went back to tell everyone — ${copy.title.toLowerCase()}, ` +
      `score ${score}. ${SITE_URL}`;
    shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
    resultsOverlay.classList.remove("hidden");
  }

  function buildShareCard(titleText) {
    const c = shareCanvas;
    const g = c.getContext("2d");
    const w = c.width, h = c.height;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#3a1a48");
    grad.addColorStop(1, "#0a0410");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    g.fillStyle = "#ff8a1e";
    g.beginPath();
    g.moveTo(w / 2 - 40, h * 0.62 + 30);
    g.lineTo(w / 2 - 60, h * 0.62 - 60);
    g.lineTo(w / 2, h * 0.62 - 120);
    g.lineTo(w / 2 + 60, h * 0.62 - 50);
    g.lineTo(w / 2 + 20, h * 0.62 + 30);
    g.closePath();
    g.fill();

    g.textAlign = "center";
    g.fillStyle = "#fff4e0";
    g.font = "800 64px 'Arial Black', Impact, sans-serif";
    g.lineWidth = 8;
    g.strokeStyle = "#ff2fd6";
    g.strokeText("PLATO'S CAVE", w / 2, 120);
    g.fillText("PLATO'S CAVE", w / 2, 120);

    g.font = "700 30px ui-monospace, monospace";
    g.fillStyle = "#ffd23f";
    g.strokeStyle = "#000";
    g.lineWidth = 5;
    g.strokeText(titleText, w / 2, 175);
    g.fillText(titleText, w / 2, 175);

    g.font = "600 26px ui-monospace, monospace";
    g.fillStyle = "#2fe6ff";
    g.strokeText(`score: ${score}`, w / 2, h - 90);
    g.fillText(`score: ${score}`, w / 2, h - 90);

    g.font = "600 24px ui-monospace, monospace";
    g.fillStyle = "#fff4e0";
    g.strokeStyle = "#000";
    g.lineWidth = 4;
    g.strokeText("bisks.net/games/platoscave", w / 2, h - 40);
    g.fillText("bisks.net/games/platoscave", w / 2, h - 40);
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (e) { return false; }
  }

  downloadBtn.addEventListener("click", async () => {
    shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      if (canShareFiles()) {
        const file = new File([blob], "platoscave.png", { type: "image/png" });
        try {
          await navigator.share({
            files: [file],
            text: resultsText.textContent,
            title: "Plato's Cave",
          });
          return;
        } catch (e) { /* fall through to download */ }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "platoscave.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  });

  function resetGame() {
    score = 0; scoreEl.textContent = "0";
    setFaith(3);
    resultsOverlay.classList.add("hidden");
    enterCave();
  }
  againBtn.addEventListener("click", () => { ensureAudio(); resetGame(); });

  // ---------- boot ----------
  enterBtn.addEventListener("click", () => {
    ensureAudio();
    splashOverlay.classList.add("hidden");
    enterCave();
  });

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);

    if (scene === "cave") { updateCave(dt); drawCave(dt, now / 1000); }
    else if (scene === "climb") { updateClimb(dt); drawClimb(dt, now / 1000); }
    else if (scene === "forms") { updateForms(dt); drawForms(); maybeShowFormsContinue(); }
    else if (scene === "return") { updateReturn(dt); drawReturn(); }
    else if (scene === "results") { drawForms(); } // keep a calm background behind the results card
    else {
      // splash: idle cave silhouette behind the loading UI
      ctx.fillStyle = "#0a0410";
      ctx.fillRect(0, 0, W, H);
      drawFire(W / 2, H * 0.7, now / 1000);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

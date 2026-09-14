// cymatics — a live Chladni-plate sand simulation.
//
// The real phenomenon: a metal plate vibrating at one of its resonant modes
// has "loud" antinode regions that move a lot and "quiet" nodal lines that
// barely move at all. Sand scattered on the plate gets bounced off the loud
// parts and settles on the quiet ones, tracing the mode's shape — that's a
// real 18th-century acoustics demo (Chladni, 1787), not a metaphor.
//
// The mode shape itself is closed-form, not simulated: for a square plate
// with mode numbers (n, m), amplitude(x, y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
// (the standard textbook approximation for a square membrane's superposed
// eigenmodes — physically loose at the exact boundary, visually the real
// Chladni-figure shape). Each grain does a random walk whose step size scales
// with the local |amplitude|: big jumps where the plate is loud, tiny ones
// near the nodes, and a step is only kept if it didn't make things louder
// (occasionally kept anyway, so a grain stuck on a local antinode ridge can
// still escape). No PDE, no diffusion grid for the physics — just per-grain
// trig and a stochastic hill-descent on |amplitude|. A separate heatmap
// buffer (deposit + decay, same shape as physarum's trail buffer) is what
// actually gets rendered, so the traced line stays visible instead of
// flickering with every grain's live jitter.
//
// Optionally seeded from a Bluesky handle (hashed client-side, no network
// call) so the same handle always settles into the same mode and gets a
// deterministic resonance name.

(function () {
  "use strict";

  const SITE_URL = "https://cymatics.bisks.net";

  // --- Palettes ------------------------------------------------------------
  const PALETTES = {
    steel: [
      [0, [4, 6, 10]],
      [0.25, [20, 28, 42]],
      [0.55, [70, 100, 140]],
      [0.8, [170, 200, 230]],
      [1, [235, 245, 255]],
    ],
    brass: [
      [0, [10, 6, 3]],
      [0.25, [55, 32, 10]],
      [0.55, [160, 105, 30]],
      [0.8, [235, 180, 80]],
      [1, [255, 235, 190]],
    ],
    aurora: [
      [0, [3, 8, 6]],
      [0.25, [10, 45, 30]],
      [0.55, [40, 140, 90]],
      [0.8, [150, 220, 190]],
      [1, [215, 190, 255]],
    ],
    ultraviolet: [
      [0, [8, 3, 10]],
      [0.25, [45, 8, 60]],
      [0.55, [150, 20, 170]],
      [0.8, [255, 80, 220]],
      [1, [190, 255, 255]],
    ],
  };
  const PALETTE_KEYS = Object.keys(PALETTES);

  function buildLut(stops) {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let a = stops[0], b = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) {
          a = stops[s]; b = stops[s + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const lt = (t - a[0]) / span;
      lut[i * 3] = a[1][0] + (b[1][0] - a[1][0]) * lt;
      lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * lt;
      lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * lt;
    }
    return lut;
  }

  const LUTS = {};
  for (const key of PALETTE_KEYS) LUTS[key] = buildLut(PALETTES[key]);

  const SYMMETRY_KEYS = ["classic", "plus", "off"];

  // --- Deterministic seeding from a handle -----------------------------------
  function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const RESONANCE_ADJ = [
    "Brazen", "Hollow", "Silvered", "Molten", "Humming", "Tempered", "Muted",
    "Gilded", "Trembling", "Copper", "Glassy", "Faint", "Ringing", "Iron",
    "Velvet", "Restless", "Frosted", "Amber", "Wandering", "Errant",
  ];
  const RESONANCE_NOUN = [
    "Overtone", "Harmonic", "Node", "Chime", "Tremor", "Timbre", "Undertone",
    "Vibration", "Cadence", "Drone", "Partial", "Waveform", "Pitch", "Echo",
    "Interval", "Modeshape", "Ripple", "Tone", "Resonance", "Frequency",
  ];

  // --- Amplitude field ------------------------------------------------------
  // Domain is the plate itself, x and y both in [-1, 1]. Degenerate case
  // n === m: the classic/plus superposition is trivially zero everywhere
  // (cos(a)cos(b) minus/plus itself), so fall back to the single term —
  // still a real, valid Chladni figure (a plain grid), just not a
  // superposition.
  function amplitude(nx, ny, n, m, symmetry) {
    const a = Math.cos(n * Math.PI * nx) * Math.cos(m * Math.PI * ny);
    if (n === m) return a;
    const b = Math.cos(m * Math.PI * nx) * Math.cos(n * Math.PI * ny);
    if (symmetry === "plus") return (a + b) * 0.5;
    if (symmetry === "off") return a - 0.5 * b;
    return a - b;
  }

  // --- DOM ---------------------------------------------------------------
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shareCanvas = document.getElementById("shareCanvas");

  const nRange = document.getElementById("n-range");
  const nVal = document.getElementById("n-val");
  const mRange = document.getElementById("m-range");
  const mVal = document.getElementById("m-val");
  const symmetrySelect = document.getElementById("symmetry-select");
  const symmetryVal = document.getElementById("symmetry-val");
  const paletteSelect = document.getElementById("palette-select");
  const paletteVal = document.getElementById("palette-val");
  const grainsRange = document.getElementById("grains-range");
  const grainsVal = document.getElementById("grains-val");
  const handleInput = document.getElementById("handle-input");
  const resonanceBox = document.getElementById("resonance");
  const resonanceName = document.getElementById("resonance-name");
  const resonanceSub = document.getElementById("resonance-sub");
  const tapBtn = document.getElementById("tap-btn");
  const ringBtn = document.getElementById("ring-btn");
  const growBtn = document.getElementById("grow-btn");
  const resetBtn = document.getElementById("reset-btn");
  const shareBskyLink = document.getElementById("share-bsky");
  const shareCardBtn = document.getElementById("share-card-btn");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const settledVal = document.getElementById("settled-val");
  const uptimeVal = document.getElementById("uptime-val");
  const panel = document.getElementById("panel");
  const panelToggle = document.getElementById("panel-toggle");

  panelToggle.addEventListener("click", () => panel.classList.toggle("collapsed"));

  // The cee.wtf secret handle-prefill link — see notes/ideas history, added
  // 2026-08-28 as a standing order for every site with a handle input.
  document.getElementById("secret-y").addEventListener("click", () => {
    const el = handleInput;
    el.value = "@cee.wtf";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.focus();
  });

  // --- Simulation state ----------------------------------------------------
  let simW = 0, simH = 0;
  let plateSize = 0, plateOffX = 0, plateOffY = 0;
  let heat = null, heatNext = null;
  let grainX = null, grainY = null;
  let numGrains = parseInt(grainsRange.value, 10);
  let modeN = parseInt(nRange.value, 10);
  let modeM = parseInt(mRange.value, 10);
  let symmetryKey = symmetrySelect.value;
  let paletteMode = paletteSelect.value; // "auto" or an explicit key
  let activeSeed = null; // { text, hash, palette, symmetry, n, m, common } | null
  let tapEnergy = 0; // decaying jolt strength from "tap the plate"
  let offscreen = document.createElement("canvas");
  let offCtx = offscreen.getContext("2d", { alpha: false });
  let imgData = null;
  let simStartTime = performance.now();
  let frameCount = 0;

  // Heatmap resolution budget, independent of window size — a genuine
  // browser-perf cap (every cell gets touched by the decay pass every frame),
  // not a default-caution one. No neighbor blur here (unlike a diffusion
  // sim), so this can run comfortably larger than physarum's trail buffer.
  const TARGET_CELLS = 90000;
  const HEAT_CAP = 6.0;
  const HEAT_DEPOSIT = 0.6;
  const HEAT_DECAY = 0.965;

  function computeSimSize() {
    const aspect = Math.max(0.4, Math.min(2.5, window.innerWidth / window.innerHeight));
    let w = Math.round(Math.sqrt(TARGET_CELLS * aspect));
    let h = Math.round(TARGET_CELLS / w);
    w = Math.max(140, Math.min(500, w));
    h = Math.max(100, Math.min(500, h));
    return { w, h };
  }

  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  function allocateSim() {
    const size = computeSimSize();
    simW = size.w;
    simH = size.h;
    // The plate is mathematically square; it's inscribed centered in the
    // (possibly non-square) grid so the mode shape never looks stretched.
    plateSize = Math.min(simW, simH);
    plateOffX = (simW - plateSize) / 2;
    plateOffY = (simH - plateSize) / 2;
    heat = new Float32Array(simW * simH);
    heatNext = new Float32Array(simW * simH);
    offscreen.width = simW;
    offscreen.height = simH;
    offCtx.imageSmoothingEnabled = false;
    imgData = offCtx.createImageData(simW, simH);
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
  }

  function allocateGrains() {
    grainX = new Float32Array(numGrains);
    grainY = new Float32Array(numGrains);
  }

  function scatterGrains(rng) {
    for (let i = 0; i < numGrains; i++) {
      grainX[i] = rng() * 2 - 1;
      grainY[i] = rng() * 2 - 1;
    }
  }

  // Re-derive a seed's mode/symmetry/auto-palette/resonance name from its
  // hash, consuming a fixed draw order so the same handle always reproduces
  // the same choices (mirrors physarum's resolveSeed).
  function resolveSeed(text) {
    const hash = hashString(text.trim().toLowerCase());
    const rng = mulberry32(hash);
    const n = 1 + Math.floor(rng() * 9);
    const m = 1 + Math.floor(rng() * 9);
    const symmetry = SYMMETRY_KEYS[Math.floor(rng() * SYMMETRY_KEYS.length)];
    const palette = PALETTE_KEYS[Math.floor(rng() * PALETTE_KEYS.length)];
    const adj = RESONANCE_ADJ[Math.floor(rng() * RESONANCE_ADJ.length)];
    const noun = RESONANCE_NOUN[Math.floor(rng() * RESONANCE_NOUN.length)];
    return { text: text.trim(), hash, n, m, symmetry, palette, common: `${adj} ${noun}` };
  }

  function currentPaletteKey() {
    if (paletteMode !== "auto") return paletteMode;
    if (activeSeed) return activeSeed.palette;
    return "steel";
  }

  function updateResonancePanel() {
    if (!activeSeed) {
      resonanceBox.classList.remove("show");
      return;
    }
    resonanceBox.classList.add("show");
    resonanceName.textContent = `🎛️ "${activeSeed.common}"`;
    resonanceSub.textContent = `grown from ${activeSeed.text} · mode ${modeN},${modeM} · ${symmetryKey}`;
  }

  function ringFrequency() {
    return Math.max(80, Math.min(900, 80 + 22 * Math.sqrt(modeN * modeN + modeM * modeM)));
  }

  function resetSim(applySeedFromInput) {
    if (applySeedFromInput) {
      const raw = handleInput.value.trim();
      activeSeed = raw ? resolveSeed(raw) : null;
      if (activeSeed) {
        modeN = activeSeed.n;
        modeM = activeSeed.m;
        symmetryKey = activeSeed.symmetry;
        nRange.value = String(modeN);
        mRange.value = String(modeM);
        symmetrySelect.value = symmetryKey;
      }
    }
    allocateGrains();
    scatterGrains(activeSeed ? mulberry32(activeSeed.hash ^ 0x9e3779b9) : Math.random);
    heat.fill(0);
    tapEnergy = 0;
    updateResonancePanel();
    nVal.textContent = String(modeN);
    mVal.textContent = String(modeM);
    symmetryVal.textContent = symmetryKey;
    paletteVal.textContent = currentPaletteKey();
    simStartTime = performance.now();
    if (ringing) updateRingFrequency();
  }

  // --- Stepping --------------------------------------------------------------
  // A stochastic hill-descent on |amplitude|: step size scales with how loud
  // it is here (big jumps on antinodes, tiny ones near nodes), a move is
  // always kept if it's quieter, and occasionally kept even when it isn't —
  // that's what lets a grain stuck near a local antinode ridge wander off it
  // instead of jittering in place forever.
  const STEP_BASE = 0.05;
  const UPHILL_ACCEPT = 0.1;

  function stepGrains() {
    const n = modeN, m = modeM, sym = symmetryKey;
    const jolt = 1 + tapEnergy * 5;
    for (let i = 0; i < numGrains; i++) {
      let x = grainX[i], y = grainY[i];
      const curAmp = Math.abs(amplitude(x, y, n, m, sym));
      const step = STEP_BASE * (0.08 + curAmp) * jolt;

      const nx = Math.max(-1, Math.min(1, x + (Math.random() * 2 - 1) * step));
      const ny = Math.max(-1, Math.min(1, y + (Math.random() * 2 - 1) * step));
      const candAmp = Math.abs(amplitude(nx, ny, n, m, sym));

      if (candAmp <= curAmp || Math.random() < UPHILL_ACCEPT) {
        x = nx; y = ny;
      }

      grainX[i] = x;
      grainY[i] = y;

      // x/y === 1 lands exactly on plateOffX/Y + plateSize, one past the
      // plate's own last cell — clamp rather than let it spill into the
      // next row (or off the end of the array on a square canvas where
      // plateOffX is 0).
      const gx = Math.min(simW - 1, (plateOffX + ((x + 1) / 2) * plateSize) | 0);
      const gy = Math.min(simH - 1, (plateOffY + ((y + 1) / 2) * plateSize) | 0);
      const cell = gy * simW + gx;
      heat[cell] = Math.min(HEAT_CAP, heat[cell] + HEAT_DEPOSIT);
    }
    if (tapEnergy > 0.002) tapEnergy *= 0.92; else tapEnergy = 0;
  }

  function decayHeat() {
    for (let i = 0; i < heat.length; i++) heatNext[i] = heat[i] * HEAT_DECAY;
    const tmp = heat;
    heat = heatNext;
    heatNext = tmp;
  }

  function render() {
    const lut = LUTS[currentPaletteKey()];
    const data = imgData.data;
    const n = simW * simH;
    for (let i = 0; i < n; i++) {
      const v = heat[i] / HEAT_CAP;
      const li = ((v > 1 ? 1 : v < 0 ? 0 : v) * 255) | 0;
      const o = i * 4, l = li * 3;
      data[o] = lut[l];
      data[o + 1] = lut[l + 1];
      data[o + 2] = lut[l + 2];
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(offscreen, 0, 0, simW, simH, 0, 0, canvas.width, canvas.height);
  }

  // Settled/uptime are cheap (TARGET_CELLS is a few tens of thousands) but
  // the DOM write is pure overhead every frame, so throttle it.
  const SETTLED_THRESHOLD = 0.12 * HEAT_CAP;
  function updateStats() {
    let settled = 0;
    const n = simW * simH;
    for (let i = 0; i < n; i++) {
      if (heat[i] > SETTLED_THRESHOLD) settled++;
    }
    settledVal.textContent = ((settled / n) * 100).toFixed(1) + "%";
    const secs = Math.floor((performance.now() - simStartTime) / 1000);
    const mm = Math.floor(secs / 60), ss = secs % 60;
    uptimeVal.textContent = `${mm}:${ss < 10 ? "0" : ""}${ss}`;
  }

  let rafId = null;
  function loop() {
    stepGrains();
    decayHeat();
    render();
    frameCount++;
    if (frameCount % 20 === 0) updateStats();
    rafId = requestAnimationFrame(loop);
  }

  // --- Pointer: nudge sand ---------------------------------------------------
  let pointerDown = false;
  const NUDGE_RADIUS = 0.16;

  function nudgeAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    // Map the pointer from CSS pixels into plate-domain [-1, 1], accounting
    // for the letterboxed square plate inside a non-square viewport.
    const px = ((clientX - rect.left) / rect.width) * simW;
    const py = ((clientY - rect.top) / rect.height) * simH;
    const px2 = (px - plateOffX) / plateSize;
    const py2 = (py - plateOffY) / plateSize;
    if (px2 < 0 || px2 > 1 || py2 < 0 || py2 > 1) return;
    const cx = px2 * 2 - 1, cy = py2 * 2 - 1;
    const r2 = NUDGE_RADIUS * NUDGE_RADIUS;
    for (let i = 0; i < numGrains; i++) {
      const dx = grainX[i] - cx, dy = grainY[i] - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (1 - d / NUDGE_RADIUS) * 0.05;
      grainX[i] = Math.max(-1, Math.min(1, grainX[i] + (dx / d) * push));
      grainY[i] = Math.max(-1, Math.min(1, grainY[i] + (dy / d) * push));
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointerDown = true;
    nudgeAt(e.clientX, e.clientY);
  });
  window.addEventListener("pointermove", (e) => {
    if (pointerDown) nudgeAt(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", () => {
    pointerDown = false;
  });

  tapBtn.addEventListener("click", () => {
    tapEnergy = 1.0;
  });

  // --- Ring the plate (Web Audio) --------------------------------------------
  let audioCtx = null, oscillator = null, gainNode = null, ringing = false;

  function updateRingFrequency() {
    if (oscillator) oscillator.frequency.setTargetAtTime(ringFrequency(), audioCtx.currentTime, 0.05);
  }

  function startRing() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = ringFrequency();
    gainNode.gain.value = 0;
    oscillator.connect(gainNode).connect(audioCtx.destination);
    oscillator.start();
    gainNode.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.15);
    ringing = true;
    ringBtn.textContent = "stop ringing";
    ringBtn.classList.add("ringing");
  }

  function stopRing() {
    if (gainNode && audioCtx) {
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    }
    const osc = oscillator;
    setTimeout(() => { try { osc && osc.stop(); } catch {} }, 250);
    oscillator = null;
    gainNode = null;
    ringing = false;
    ringBtn.textContent = "ring it";
    ringBtn.classList.remove("ringing");
  }

  ringBtn.addEventListener("click", () => {
    if (ringing) stopRing();
    else startRing();
  });

  // --- UI wiring -----------------------------------------------------------
  nRange.addEventListener("input", () => { nVal.textContent = nRange.value; });
  nRange.addEventListener("change", () => {
    modeN = parseInt(nRange.value, 10);
    activeSeed = null;
    updateResonancePanel();
    updateRingFrequency();
  });
  mRange.addEventListener("input", () => { mVal.textContent = mRange.value; });
  mRange.addEventListener("change", () => {
    modeM = parseInt(mRange.value, 10);
    activeSeed = null;
    updateResonancePanel();
    updateRingFrequency();
  });
  symmetrySelect.addEventListener("change", () => {
    symmetryKey = symmetrySelect.value;
    symmetryVal.textContent = symmetryKey;
    activeSeed = null;
    updateResonancePanel();
  });
  paletteSelect.addEventListener("change", () => {
    paletteMode = paletteSelect.value;
    paletteVal.textContent = currentPaletteKey();
    updateResonancePanel();
  });

  // Committing the range only on "change" (pointer release), not "input" on
  // every tick, so dragging the slider doesn't reallocate grains dozens of
  // times a second.
  grainsRange.addEventListener("input", () => { grainsVal.textContent = grainsRange.value; });
  grainsRange.addEventListener("change", () => {
    numGrains = parseInt(grainsRange.value, 10);
    resetSim(false);
  });

  growBtn.addEventListener("click", () => resetSim(true));
  resetBtn.addEventListener("click", () => {
    activeSeed = null;
    handleInput.value = "";
    resetSim(false);
  });
  handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") resetSim(true);
  });

  // --- Sharing -------------------------------------------------------------
  function buildPermalink() {
    const params = new URLSearchParams();
    if (activeSeed) params.set("seed", activeSeed.text);
    params.set("n", String(modeN));
    params.set("m", String(modeM));
    params.set("symmetry", symmetryKey);
    params.set("palette", currentPaletteKey());
    params.set("grains", String(numGrains));
    return `${SITE_URL}/?${params.toString()}`;
  }

  function buildShareText() {
    const link = buildPermalink();
    if (activeSeed) {
      return `my cymatics plate, "${activeSeed.common}" (seeded from ${activeSeed.text}, mode ${modeN},${modeM}) — grow your own: ${link}`;
    }
    return `watching sand trace a Chladni figure live in the browser (mode ${modeN},${modeM}, ${symmetryKey}, ${currentPaletteKey()} palette): ${link}`;
  }

  function refreshShareLink() {
    shareBskyLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
  }

  copyLinkBtn.addEventListener("click", async () => {
    const link = buildPermalink();
    const label = copyLinkBtn.textContent;
    try {
      await navigator.clipboard.writeText(link);
      copyLinkBtn.textContent = "copied!";
    } catch {
      window.prompt("copy this link:", link);
    }
    setTimeout(() => { copyLinkBtn.textContent = label; }, 1400);
  });

  // --- Permalink restore ---------------------------------------------------
  function applyUrlParams() {
    const q = new URLSearchParams(window.location.search);
    let hasSeed = false;
    const n = parseInt(q.get("n"), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 9) {
      modeN = n;
      nRange.value = String(n);
    }
    const m = parseInt(q.get("m"), 10);
    if (Number.isFinite(m) && m >= 1 && m <= 9) {
      modeM = m;
      mRange.value = String(m);
    }
    const symmetry = q.get("symmetry");
    if (symmetry && SYMMETRY_KEYS.includes(symmetry)) {
      symmetryKey = symmetry;
      symmetrySelect.value = symmetry;
    }
    const palette = q.get("palette");
    if (palette && (palette === "auto" || PALETTES[palette])) {
      paletteMode = palette;
      paletteSelect.value = palette;
    }
    const grains = parseInt(q.get("grains"), 10);
    if (Number.isFinite(grains) && grains >= 1000 && grains <= 16000) {
      numGrains = grains;
      grainsRange.value = String(grains);
      grainsVal.textContent = String(grains);
    }
    const seed = q.get("seed");
    if (seed) {
      handleInput.value = seed.slice(0, 60);
      hasSeed = true;
    }
    return hasSeed;
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  function buildShareCard(cb) {
    const c = shareCanvas.getContext("2d");
    const cw = shareCanvas.width, ch = shareCanvas.height;

    const cropW = canvas.width, cropH = canvas.height;
    const scale = Math.max(cw / cropW, ch / cropH);
    const sw = cw / scale, sh = ch / scale;
    c.drawImage(canvas, (cropW - sw) / 2, (cropH - sh) / 2, sw, sh, 0, 0, cw, ch);

    c.fillStyle = "rgba(7,8,12,0.55)";
    c.fillRect(0, ch - 190, cw, 190);

    c.textAlign = "left";
    c.fillStyle = "#f2f5ff";
    c.font = "800 46px monospace";
    c.fillText("cymatics", 48, ch - 128);

    c.fillStyle = "#ffcf4d";
    c.font = "700 30px monospace";
    if (activeSeed) {
      c.fillText(`"${activeSeed.common}" — seeded from ${activeSeed.text}`, 48, ch - 82);
    } else {
      c.fillText(`sand traces a Chladni figure`, 48, ch - 82);
    }

    c.fillStyle = "#8fd6ff";
    c.font = "700 26px monospace";
    c.fillText(`mode ${modeN},${modeM} · ${symmetryKey} · ${currentPaletteKey()} palette`, 48, ch - 44);

    c.fillStyle = "#9aa3c0";
    c.font = "600 22px monospace";
    c.textAlign = "right";
    c.fillText("cymatics.bisks.net", cw - 40, ch - 44);
    c.textAlign = "left";

    shareCanvas.toBlob((blob) => cb(blob), "image/png");
  }

  shareCardBtn.addEventListener("click", () => {
    buildShareCard(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "cymatics.png", { type: "image/png" });
      if (canShareFiles()) {
        try {
          await navigator.share({ files: [file], text: buildShareText(), title: "cymatics" });
          return;
        } catch {
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cymatics.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  });

  // --- Bootstrap -----------------------------------------------------------
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      allocateSim();
      resetSim(false);
    }, 300);
  });

  resizeCanvas();
  allocateSim();
  const hasSeedFromUrl = applyUrlParams();
  resetSim(hasSeedFromUrl);
  refreshShareLink();
  setInterval(refreshShareLink, 1000);
  loop();
})();

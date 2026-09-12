// physarum — a live slime-mold (Physarum polycephalum) agent simulation.
//
// The classic Jones (2010) model: each agent has no memory beyond its own
// position and heading. Every step it samples the shared pheromone trail at
// three points ahead of it (front/front-left/front-right), turns toward
// whichever sensor saw the most trail, moves forward, and deposits its own
// pheromone where it lands. The trail then diffuses and decays. That's the
// entire rule set — the branching, web-like foraging network is an emergent
// side effect, not something anyone programmed directly.
//
// Everything below runs on two Float32Array buffers (the trail map, double-
// buffered for diffusion) and three Float32Arrays for agent state (x, y,
// angle) — no DOM per agent, no physics library, just typed-array math and a
// canvas. Optionally seeded from a Bluesky handle (hashed client-side, no
// network call) so the same handle always grows visually the same shape and
// gets a deterministic nickname.

(function () {
  "use strict";

  const SITE_URL = "https://physarum.bisks.net";

  // --- Palettes ------------------------------------------------------------
  // Each is a list of [position 0..1, [r,g,b]] stops; buildLut interpolates
  // them into a 256-entry lookup table so rendering is one array read per
  // trail value instead of per-pixel color math.
  const PALETTES = {
    bio: [
      [0, [3, 10, 8]],
      [0.25, [8, 40, 28]],
      [0.55, [30, 140, 80]],
      [0.8, [130, 240, 150]],
      [1, [220, 255, 210]],
    ],
    ember: [
      [0, [8, 4, 4]],
      [0.25, [60, 10, 6]],
      [0.55, [180, 60, 10]],
      [0.8, [255, 150, 30]],
      [1, [255, 235, 180]],
    ],
    abyssal: [
      [0, [3, 4, 10]],
      [0.25, [10, 20, 55]],
      [0.55, [30, 60, 140]],
      [0.8, [100, 150, 255]],
      [1, [210, 230, 255]],
    ],
    toxic: [
      [0, [6, 3, 8]],
      [0.25, [60, 6, 60]],
      [0.55, [170, 20, 150]],
      [0.8, [210, 255, 60]],
      [1, [240, 255, 200]],
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

  // --- Growth patterns -------------------------------------------------------
  // Sensor/turn/deposit parameters straight out of the Jones model's tunable
  // space — different corners of it produce visibly different colony shapes.
  const PATTERNS = {
    web: { sensorAngle: 0.45, sensorDist: 9, turnSpeed: 0.3, moveSpeed: 1.2, depositAmount: 1.0, decayFactor: 0.97, diffuseRate: 0.6 },
    veins: { sensorAngle: 0.3, sensorDist: 11, turnSpeed: 0.18, moveSpeed: 1.4, depositAmount: 0.9, decayFactor: 0.985, diffuseRate: 0.5 },
    coral: { sensorAngle: 0.9, sensorDist: 7, turnSpeed: 0.5, moveSpeed: 0.9, depositAmount: 1.3, decayFactor: 0.94, diffuseRate: 0.75 },
    storm: { sensorAngle: 0.7, sensorDist: 6, turnSpeed: 0.7, moveSpeed: 1.8, depositAmount: 1.1, decayFactor: 0.9, diffuseRate: 0.8 },
  };

  const TRAIL_CAP = 5.0;
  // Deposits from a click/drag "food" hotspot get a higher ceiling than an
  // agent's own trail so a hotspot visibly outshines ordinary trail and
  // reliably draws the colony toward it.
  const FOOD_CAP = 9.0;
  const SPAWN_KINDS = ["random", "ring", "center", "corners"];

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

  const SPECIES_ADJ = [
    "Luminous", "Feral", "Velvet", "Copper", "Whispering", "Gloomy", "Electric",
    "Tidal", "Ashen", "Vermillion", "Quiet", "Restless", "Amber", "Frosted",
    "Molten", "Errant", "Hollow", "Radiant", "Brittle", "Wandering",
  ];
  const SPECIES_NOUN = [
    "Driftcap", "Filament", "Spore", "Rootling", "Colony", "Tendril", "Bloomer",
    "Mycelia", "Wisp", "Creeper", "Lattice", "Weave", "Nexus", "Strand",
    "Bramble", "Growth", "Pulse", "Veinling", "Cluster", "Reach",
  ];

  // --- DOM ---------------------------------------------------------------
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shareCanvas = document.getElementById("shareCanvas");

  const paletteSelect = document.getElementById("palette-select");
  const paletteVal = document.getElementById("palette-val");
  const patternSelect = document.getElementById("pattern-select");
  const patternVal = document.getElementById("pattern-val");
  const agentsRange = document.getElementById("agents-range");
  const agentsVal = document.getElementById("agents-val");
  const handleInput = document.getElementById("handle-input");
  const speciesBox = document.getElementById("species");
  const speciesName = document.getElementById("species-name");
  const speciesSub = document.getElementById("species-sub");
  const growBtn = document.getElementById("grow-btn");
  const resetBtn = document.getElementById("reset-btn");
  const shareBskyLink = document.getElementById("share-bsky");
  const shareCardBtn = document.getElementById("share-card-btn");
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
  let trail = null, trailNext = null;
  let agentX = null, agentY = null, agentAngle = null;
  let numAgents = parseInt(agentsRange.value, 10);
  let patternKey = patternSelect.value;
  let paletteMode = paletteSelect.value; // "auto" or an explicit key
  let activeSeed = null; // { text, hash, palette, spawnKind, common } | null
  let offscreen = document.createElement("canvas");
  let offCtx = offscreen.getContext("2d", { alpha: false });
  let imgData = null;

  // Cell budget the trail buffer + diffusion pass are sized to, independent
  // of window size — this is a genuine browser-perf cap (diffusion touches
  // every cell every frame), not a default-caution one: past a few hundred
  // thousand cells the diffusion pass stops being sub-frame on a typical
  // laptop. The result is upscaled to fill the viewport with canvas
  // smoothing, which is part of the organic look, not a compromise.
  const TARGET_CELLS = 55000;

  function computeSimSize() {
    const aspect = Math.max(0.4, Math.min(2.5, window.innerWidth / window.innerHeight));
    let w = Math.round(Math.sqrt(TARGET_CELLS * aspect));
    let h = Math.round(TARGET_CELLS / w);
    w = Math.max(120, Math.min(480, w));
    h = Math.max(90, Math.min(480, h));
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
    trail = new Float32Array(simW * simH);
    trailNext = new Float32Array(simW * simH);
    offscreen.width = simW;
    offscreen.height = simH;
    offCtx.imageSmoothingEnabled = false;
    imgData = offCtx.createImageData(simW, simH);
    // opaque alpha channel, set once — only rgb changes per frame
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
  }

  function allocateAgents() {
    agentX = new Float32Array(numAgents);
    agentY = new Float32Array(numAgents);
    agentAngle = new Float32Array(numAgents);
  }

  function spawnAgents(kind, rng) {
    for (let i = 0; i < numAgents; i++) {
      let x, y, angle;
      switch (kind) {
        case "ring": {
          const a = rng() * Math.PI * 2;
          const r = Math.min(simW, simH) * 0.32;
          x = simW / 2 + Math.cos(a) * r;
          y = simH / 2 + Math.sin(a) * r;
          angle = a + Math.PI / 2;
          break;
        }
        case "center": {
          const a = rng() * Math.PI * 2;
          const r = rng() * Math.min(simW, simH) * 0.08;
          x = simW / 2 + Math.cos(a) * r;
          y = simH / 2 + Math.sin(a) * r;
          angle = rng() * Math.PI * 2;
          break;
        }
        case "corners": {
          const corner = Math.floor(rng() * 4);
          const cx = corner % 2 === 0 ? simW * 0.15 : simW * 0.85;
          const cy = corner < 2 ? simH * 0.15 : simH * 0.85;
          const r = rng() * Math.min(simW, simH) * 0.06;
          const a = rng() * Math.PI * 2;
          x = cx + Math.cos(a) * r;
          y = cy + Math.sin(a) * r;
          angle = rng() * Math.PI * 2;
          break;
        }
        default: {
          x = rng() * simW;
          y = rng() * simH;
          angle = rng() * Math.PI * 2;
        }
      }
      agentX[i] = x;
      agentY[i] = y;
      agentAngle[i] = angle;
    }
  }

  // Re-derive a seed's spawn kind / auto-palette / species name from its hash,
  // consuming a fresh rng in a fixed draw order so the same handle always
  // reproduces the same choices. spawnRngForSeed (below) replays the same
  // first four draws before handing back the rng for agent placement, so
  // re-spawning the same seed (agent-count change, window resize, pressing
  // "grow" again) always starts the agent layout from the same point instead
  // of continuing wherever a shared generator happened to be left off.
  function resolveSeed(text) {
    const hash = hashString(text.trim().toLowerCase());
    const rng = mulberry32(hash);
    const spawnKind = SPAWN_KINDS[Math.floor(rng() * SPAWN_KINDS.length)];
    const palette = PALETTE_KEYS[Math.floor(rng() * PALETTE_KEYS.length)];
    const adj = SPECIES_ADJ[Math.floor(rng() * SPECIES_ADJ.length)];
    const noun = SPECIES_NOUN[Math.floor(rng() * SPECIES_NOUN.length)];
    return { text: text.trim(), hash, spawnKind, palette, common: `${adj} ${noun}` };
  }

  function spawnRngForSeed(seed) {
    const rng = mulberry32(seed.hash);
    rng(); rng(); rng(); rng(); // burn the 4 draws resolveSeed already made
    return rng;
  }

  function currentPatternParams() {
    return PATTERNS[patternKey] || PATTERNS.veins;
  }

  function currentPaletteKey() {
    if (paletteMode !== "auto") return paletteMode;
    if (activeSeed) return activeSeed.palette;
    return "bio";
  }

  function updateSpeciesPanel() {
    if (!activeSeed) {
      speciesBox.classList.remove("show");
      return;
    }
    speciesBox.classList.add("show");
    speciesName.textContent = `🧫 “${activeSeed.common}”`;
    speciesSub.textContent = `grown from ${activeSeed.text} · ${patternKey} · ${currentPaletteKey()}`;
  }

  function resetSim(applySeedFromInput) {
    if (applySeedFromInput) {
      const raw = handleInput.value.trim();
      activeSeed = raw ? resolveSeed(raw) : null;
    }
    allocateAgents();
    if (activeSeed) {
      spawnAgents(activeSeed.spawnKind, spawnRngForSeed(activeSeed));
    } else {
      spawnAgents("random", Math.random);
    }
    trail.fill(0);
    updateSpeciesPanel();
    paletteVal.textContent = currentPaletteKey();
    patternVal.textContent = patternKey;
  }

  // --- Stepping --------------------------------------------------------------
  function sense(x, y, angle, dist) {
    let sx = (x + Math.cos(angle) * dist) % simW;
    let sy = (y + Math.sin(angle) * dist) % simH;
    if (sx < 0) sx += simW;
    if (sy < 0) sy += simH;
    return trail[(sy | 0) * simW + (sx | 0)];
  }

  function stepAgents(p) {
    const w = simW, h = simH;
    for (let i = 0; i < numAgents; i++) {
      let ax = agentX[i], ay = agentY[i], angle = agentAngle[i];

      const sf = sense(ax, ay, angle, p.sensorDist);
      const sl = sense(ax, ay, angle - p.sensorAngle, p.sensorDist);
      const sr = sense(ax, ay, angle + p.sensorAngle, p.sensorDist);

      if (sf >= sl && sf >= sr) {
        // straight
      } else if (sl > sr) {
        angle += p.turnSpeed;
      } else if (sr > sl) {
        angle -= p.turnSpeed;
      } else {
        angle += Math.random() < 0.5 ? -p.turnSpeed : p.turnSpeed;
      }

      ax += Math.cos(angle) * p.moveSpeed;
      ay += Math.sin(angle) * p.moveSpeed;
      if (ax < 0) ax += w; else if (ax >= w) ax -= w;
      if (ay < 0) ay += h; else if (ay >= h) ay -= h;

      agentX[i] = ax;
      agentY[i] = ay;
      agentAngle[i] = angle;

      const cell = (ay | 0) * w + (ax | 0);
      trail[cell] = Math.min(TRAIL_CAP, trail[cell] + p.depositAmount);
    }
  }

  function diffuseAndDecay(p) {
    const w = simW, h = simH;
    const diffuseRate = p.diffuseRate, decay = p.decayFactor;
    for (let y = 0; y < h; y++) {
      const yUp = y === 0 ? h - 1 : y - 1;
      const yDown = y === h - 1 ? 0 : y + 1;
      const rowC = y * w, rowU = yUp * w, rowD = yDown * w;
      for (let x = 0; x < w; x++) {
        const xL = x === 0 ? w - 1 : x - 1;
        const xR = x === w - 1 ? 0 : x + 1;
        const sum =
          trail[rowU + xL] + trail[rowU + x] + trail[rowU + xR] +
          trail[rowC + xL] + trail[rowC + x] + trail[rowC + xR] +
          trail[rowD + xL] + trail[rowD + x] + trail[rowD + xR];
        const avg = sum / 9;
        const cur = trail[rowC + x];
        trailNext[rowC + x] = (cur * (1 - diffuseRate) + avg * diffuseRate) * decay;
      }
    }
    const tmp = trail;
    trail = trailNext;
    trailNext = tmp;
  }

  function render() {
    const lut = LUTS[currentPaletteKey()];
    const data = imgData.data;
    const n = simW * simH;
    for (let i = 0; i < n; i++) {
      const v = trail[i] / TRAIL_CAP;
      const li = ((v > 1 ? 1 : v < 0 ? 0 : v) * 255) | 0;
      const o = i * 4, l = li * 3;
      data[o] = lut[l];
      data[o + 1] = lut[l + 1];
      data[o + 2] = lut[l + 2];
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(offscreen, 0, 0, simW, simH, 0, 0, canvas.width, canvas.height);
  }

  let rafId = null;
  function loop() {
    const p = currentPatternParams();
    stepAgents(p);
    diffuseAndDecay(p);
    render();
    rafId = requestAnimationFrame(loop);
  }

  // --- Food dropping -----------------------------------------------------
  let pointerDown = false;

  function depositFoodAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * simW;
    const sy = ((clientY - rect.top) / rect.height) * simH;
    const radius = Math.max(3, Math.min(simW, simH) * 0.025);
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(sx - radius));
    const maxX = Math.min(simW - 1, Math.ceil(sx + radius));
    const minY = Math.max(0, Math.floor(sy - radius));
    const maxY = Math.min(simH - 1, Math.ceil(sy + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - sx, dy = y - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / radius;
        const cell = y * simW + x;
        trail[cell] = Math.min(FOOD_CAP, trail[cell] + falloff * 3);
      }
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointerDown = true;
    depositFoodAt(e.clientX, e.clientY);
  });
  window.addEventListener("pointermove", (e) => {
    if (pointerDown) depositFoodAt(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", () => {
    pointerDown = false;
  });

  // --- UI wiring -----------------------------------------------------------
  paletteSelect.addEventListener("change", () => {
    paletteMode = paletteSelect.value;
    paletteVal.textContent = currentPaletteKey();
    updateSpeciesPanel();
  });

  patternSelect.addEventListener("change", () => {
    patternKey = patternSelect.value;
    patternVal.textContent = patternKey;
    updateSpeciesPanel();
  });

  // Committing the range only on "change" (pointer release), not "input" on
  // every tick, so dragging the slider doesn't reallocate + reseed agents
  // dozens of times a second.
  agentsRange.addEventListener("input", () => {
    agentsVal.textContent = agentsRange.value;
  });
  agentsRange.addEventListener("change", () => {
    numAgents = parseInt(agentsRange.value, 10);
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
  function buildShareText() {
    if (activeSeed) {
      return `my physarum colony, "${activeSeed.common}" (seeded from ${activeSeed.text}, ${patternKey} pattern) — grow your own: ${SITE_URL}`;
    }
    return `watching a slime-mold colony grow its own foraging network, live in the browser (${patternKey} pattern, ${currentPaletteKey()} palette): ${SITE_URL}`;
  }

  function refreshShareLink() {
    shareBskyLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
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

    // Crop the current live frame into the card as the backdrop.
    const cropW = canvas.width, cropH = canvas.height;
    const scale = Math.max(cw / cropW, ch / cropH);
    const sw = cw / scale, sh = ch / scale;
    c.drawImage(canvas, (cropW - sw) / 2, (cropH - sh) / 2, sw, sh, 0, 0, cw, ch);

    c.fillStyle = "rgba(4,8,10,0.55)";
    c.fillRect(0, ch - 190, cw, 190);

    c.textAlign = "left";
    c.fillStyle = "#eafff5";
    c.font = "800 46px monospace";
    c.fillText("physarum", 48, ch - 128);

    c.fillStyle = "#ffcf4d";
    c.font = "700 30px monospace";
    if (activeSeed) {
      c.fillText(`"${activeSeed.common}" — seeded from ${activeSeed.text}`, 48, ch - 82);
    } else {
      c.fillText(`a slime-mold colony grows its own network`, 48, ch - 82);
    }

    c.fillStyle = "#6dffb8";
    c.font = "700 26px monospace";
    c.fillText(`${patternKey} pattern · ${currentPaletteKey()} palette`, 48, ch - 44);

    c.fillStyle = "#8fb0a6";
    c.font = "600 22px monospace";
    c.textAlign = "right";
    c.fillText("physarum.bisks.net", cw - 40, ch - 44);
    c.textAlign = "left";

    shareCanvas.toBlob((blob) => cb(blob), "image/png");
  }

  shareCardBtn.addEventListener("click", () => {
    buildShareCard(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "physarum.png", { type: "image/png" });
      if (canShareFiles()) {
        try {
          await navigator.share({ files: [file], text: buildShareText(), title: "physarum" });
          return;
        } catch {
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "physarum.png";
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
  resetSim(false);
  refreshShareLink();
  setInterval(refreshShareLink, 1000);
  loop();
})();

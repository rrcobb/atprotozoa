// attractors — a live strange-attractor renderer.
//
// Three families of 2D chaotic map (Clifford, Peter de Jong, Svensson).
// Every term in all three is a sine or cosine scaled by a fixed coefficient,
// so the output of one step is always bounded no matter what a/b/c/d are —
// there's no divergence case to guard against, which is why the parameter
// sliders can be dragged live with no validation. A pool of "walkers" each
// hold their own (x, y) state and keep iterating their own map forever;
// every point they land on gets added to a density buffer, rendered through
// a log-compressed palette lookup so the shape brightens the longer it runs
// instead of saturating solid after a few seconds.
//
// Optionally seeded from a Bluesky handle (hashed client-side, no network
// call) so the same handle always produces the same family, parameters, and
// a deterministic species-style name.

(function () {
  "use strict";

  const SITE_URL = "https://attractors.bisks.net";

  // --- Attractor families ----------------------------------------------------
  // Each step fn is bounded by construction: every term is |sin|/|cos| <= 1
  // times a fixed coefficient, so x'/y' can never exceed a small multiple of
  // the coefficients regardless of a/b/c/d — see the wrangler.toml comment.
  const FAMILIES = {
    clifford: {
      label: "clifford",
      step: (x, y, p) => [
        Math.sin(p.a * y) + p.c * Math.cos(p.a * x),
        Math.sin(p.b * x) + p.d * Math.cos(p.b * y),
      ],
    },
    dejong: {
      label: "de jong",
      step: (x, y, p) => [
        Math.sin(p.a * y) - Math.cos(p.b * x),
        Math.sin(p.c * x) - Math.cos(p.d * y),
      ],
    },
    svensson: {
      label: "svensson",
      step: (x, y, p) => [
        p.d * Math.sin(p.a * x) - Math.sin(p.b * y),
        p.c * Math.cos(p.a * x) + Math.cos(p.b * y),
      ],
    },
  };
  const FAMILY_KEYS = Object.keys(FAMILIES);

  // --- Palettes ------------------------------------------------------------
  const PALETTES = {
    nebula: [
      [0, [4, 3, 12]],
      [0.25, [22, 12, 60]],
      [0.55, [90, 60, 200]],
      [0.8, [170, 150, 255]],
      [1, [235, 230, 255]],
    ],
    ember: [
      [0, [8, 4, 4]],
      [0.25, [60, 10, 6]],
      [0.55, [180, 60, 10]],
      [0.8, [255, 150, 30]],
      [1, [255, 235, 180]],
    ],
    glacier: [
      [0, [3, 6, 10]],
      [0.25, [8, 30, 45]],
      [0.55, [30, 110, 150]],
      [0.8, [140, 220, 240]],
      [1, [230, 250, 255]],
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
    "Vortex", "Spiral", "Lattice", "Halo", "Orbit", "Braid", "Filament",
    "Weave", "Nebula", "Coil", "Drift", "Bloom", "Loop", "Skein", "Wake",
    "Ribbon", "Fold", "Tangle", "Bell", "Wing",
  ];

  function paramFromRng(rng) {
    return rng() * 6 - 3; // [-3, 3]
  }

  // Draws, in a fixed order, everything a fresh recipe needs from one rng —
  // used both for a handle seed and for the plain "randomize" button (with
  // Math.random standing in for a per-call rng there).
  function recipeFromRng(rng) {
    const family = FAMILY_KEYS[Math.floor(rng() * FAMILY_KEYS.length)];
    const a = paramFromRng(rng), b = paramFromRng(rng), c = paramFromRng(rng), d = paramFromRng(rng);
    const palette = PALETTE_KEYS[Math.floor(rng() * PALETTE_KEYS.length)];
    const adj = SPECIES_ADJ[Math.floor(rng() * SPECIES_ADJ.length)];
    const noun = SPECIES_NOUN[Math.floor(rng() * SPECIES_NOUN.length)];
    return { family, a, b, c, d, palette, common: `${adj} ${noun}` };
  }

  function resolveSeed(text) {
    const hash = hashString(text.trim().toLowerCase());
    const recipe = recipeFromRng(mulberry32(hash));
    return { text: text.trim(), hash, ...recipe };
  }

  // --- DOM ---------------------------------------------------------------
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shareCanvas = document.getElementById("shareCanvas");

  const familySelect = document.getElementById("family-select");
  const familyVal = document.getElementById("family-val");
  const paletteSelect = document.getElementById("palette-select");
  const paletteVal = document.getElementById("palette-val");
  const aRange = document.getElementById("a-range"), aVal = document.getElementById("a-val");
  const bRange = document.getElementById("b-range"), bVal = document.getElementById("b-val");
  const cRange = document.getElementById("c-range"), cVal = document.getElementById("c-val");
  const dRange = document.getElementById("d-range"), dVal = document.getElementById("d-val");
  const walkersRange = document.getElementById("walkers-range");
  const walkersVal = document.getElementById("walkers-val");
  const exposureRange = document.getElementById("exposure-range");
  const exposureVal = document.getElementById("exposure-val");
  const handleInput = document.getElementById("handle-input");
  const speciesBox = document.getElementById("species");
  const speciesName = document.getElementById("species-name");
  const speciesSub = document.getElementById("species-sub");
  const randomizeBtn = document.getElementById("randomize-btn");
  const resetBtn = document.getElementById("reset-btn");
  const shareBskyLink = document.getElementById("share-bsky");
  const shareCardBtn = document.getElementById("share-card-btn");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const pointsVal = document.getElementById("points-val");
  const uptimeVal = document.getElementById("uptime-val");
  const panel = document.getElementById("panel");
  const panelToggle = document.getElementById("panel-toggle");

  panelToggle.addEventListener("click", () => panel.classList.toggle("collapsed"));

  // The cee.wtf secret handle-prefill link — see notes/ideas history, added
  // 2026-08-28 as a standing order for every site with a handle input.
  document.getElementById("secret-s").addEventListener("click", () => {
    handleInput.value = "@cee.wtf";
    handleInput.dispatchEvent(new Event("input", { bubbles: true }));
    handleInput.dispatchEvent(new Event("change", { bubbles: true }));
    handleInput.focus();
  });

  // --- State -----------------------------------------------------------------
  let simW = 0, simH = 0;
  let density = null;
  let runningMax = 1;
  let offscreen = document.createElement("canvas");
  let offCtx = offscreen.getContext("2d", { alpha: false });
  let imgData = null;

  let familyKey = familySelect.value;
  let params = { a: 0, b: 0, c: 0, d: 0 };
  let paletteMode = paletteSelect.value; // "auto" or explicit key
  let activeSeed = null; // set when the current recipe came from a handle
  let numWalkers = parseInt(walkersRange.value, 10);
  let exposure = parseFloat(exposureRange.value);
  let walkerX = null, walkerY = null;
  let transform = { scale: 1, cx: 0, cy: 0 }; // attractor space -> grid space
  let totalPoints = 0;
  let simStartTime = performance.now();
  let frameCount = 0;

  // Cell budget the density buffer is sized to, independent of window size —
  // there's no diffusion pass here (just an add-and-normalize), so this can
  // run considerably higher than a reaction-diffusion sim's cap and still be
  // sub-frame; the ceiling exists for canvas upload/putImageData cost, not
  // for the accumulation loop itself.
  const TARGET_CELLS = 260000;

  function computeSimSize() {
    const aspect = Math.max(0.4, Math.min(2.5, window.innerWidth / window.innerHeight));
    let w = Math.round(Math.sqrt(TARGET_CELLS * aspect));
    let h = Math.round(TARGET_CELLS / w);
    w = Math.max(160, Math.min(900, w));
    h = Math.max(120, Math.min(900, h));
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
    density = new Float32Array(simW * simH);
    offscreen.width = simW;
    offscreen.height = simH;
    offCtx.imageSmoothingEnabled = false;
    imgData = offCtx.createImageData(simW, simH);
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
  }

  // Runs a short burn-in from a fixed start, then samples the next stretch of
  // the trajectory to find the attractor's actual extent, so every family/
  // parameter combination fills the view instead of needing a hand-tuned
  // scale per family.
  function fitTransform() {
    const fam = FAMILIES[familyKey];
    let x = 0.1, y = 0.1;
    for (let i = 0; i < 500; i++) [x, y] = fam.step(x, y, params);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 6000; i++) {
      [x, y] = fam.step(x, y, params);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const rangeX = Math.max(1e-6, maxX - minX);
    const rangeY = Math.max(1e-6, maxY - minY);
    const range = Math.max(rangeX, rangeY) * 1.15;
    const scale = Math.min(simW, simH) / range;
    transform = { scale, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  function currentPaletteKey() {
    if (paletteMode !== "auto") return paletteMode;
    if (activeSeed) return activeSeed.palette;
    return "nebula";
  }

  function updateSpeciesPanel() {
    if (!activeSeed) {
      speciesBox.classList.remove("show");
      return;
    }
    speciesBox.classList.add("show");
    speciesName.textContent = `🌀 “${activeSeed.common}”`;
    speciesSub.textContent = `grown from ${activeSeed.text} · ${FAMILIES[familyKey].label} · ${currentPaletteKey()}`;
  }

  function syncParamControls() {
    familySelect.value = familyKey;
    familyVal.textContent = FAMILIES[familyKey].label;
    aRange.value = String(params.a); aVal.textContent = params.a.toFixed(2);
    bRange.value = String(params.b); bVal.textContent = params.b.toFixed(2);
    cRange.value = String(params.c); cVal.textContent = params.c.toFixed(2);
    dRange.value = String(params.d); dVal.textContent = params.d.toFixed(2);
    paletteVal.textContent = currentPaletteKey();
  }

  function seedWalkers() {
    if (!walkerX || walkerX.length !== numWalkers) {
      walkerX = new Float32Array(numWalkers);
      walkerY = new Float32Array(numWalkers);
    }
    for (let i = 0; i < numWalkers; i++) {
      // Small deterministic spread near the origin — the map's own dynamics
      // pull every walker onto the attractor within a handful of steps
      // regardless of exactly where it starts.
      walkerX[i] = 0.05 + i * 1e-5;
      walkerY[i] = -0.05 - i * 1e-5;
    }
  }

  function resetSim(applyFromInputOrRecipe) {
    if (applyFromInputOrRecipe === "input") {
      const raw = handleInput.value.trim();
      if (raw) {
        activeSeed = resolveSeed(raw);
        familyKey = activeSeed.family;
        params = { a: activeSeed.a, b: activeSeed.b, c: activeSeed.c, d: activeSeed.d };
      } else {
        activeSeed = null;
      }
    } else if (applyFromInputOrRecipe && typeof applyFromInputOrRecipe === "object") {
      activeSeed = null;
      familyKey = applyFromInputOrRecipe.family;
      params = { a: applyFromInputOrRecipe.a, b: applyFromInputOrRecipe.b, c: applyFromInputOrRecipe.c, d: applyFromInputOrRecipe.d };
    }
    fitTransform();
    seedWalkers();
    density.fill(0);
    runningMax = 1;
    totalPoints = 0;
    simStartTime = performance.now();
    syncParamControls();
    updateSpeciesPanel();
  }

  // --- Stepping ----------------------------------------------------------
  const ITERS_PER_WALKER_PER_FRAME = 20;

  function stepAndAccumulate() {
    const fam = FAMILIES[familyKey].step;
    const w = simW, h = simH;
    let localMax = runningMax;
    for (let i = 0; i < numWalkers; i++) {
      let x = walkerX[i], y = walkerY[i];
      for (let k = 0; k < ITERS_PER_WALKER_PER_FRAME; k++) {
        const [nx, ny] = fam(x, y, params);
        x = nx; y = ny;
        const px = (w / 2 + (x - transform.cx) * transform.scale) | 0;
        const py = (h / 2 + (y - transform.cy) * transform.scale) | 0;
        if (px >= 0 && px < w && py >= 0 && py < h) {
          const cell = py * w + px;
          const v = density[cell] + 1;
          density[cell] = v;
          if (v > localMax) localMax = v;
        }
      }
      walkerX[i] = x; walkerY[i] = y;
    }
    runningMax = localMax;
    totalPoints += numWalkers * ITERS_PER_WALKER_PER_FRAME;
  }

  function render() {
    const lut = LUTS[currentPaletteKey()];
    const data = imgData.data;
    const n = simW * simH;
    // log1p compression so density growing over time brightens the shape
    // instead of a handful of hot cells saturating white in the first
    // second while the rest stays black.
    const norm = Math.log1p(Math.max(1, runningMax / exposure));
    for (let i = 0; i < n; i++) {
      const v = density[i];
      const t = v > 0 ? Math.log1p(v) / norm : 0;
      const li = ((t > 1 ? 1 : t) * 255) | 0;
      const o = i * 4, l = li * 3;
      data[o] = lut[l];
      data[o + 1] = lut[l + 1];
      data[o + 2] = lut[l + 2];
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(offscreen, 0, 0, simW, simH, 0, 0, canvas.width, canvas.height);
  }

  function updateStats() {
    pointsVal.textContent =
      totalPoints > 1e6 ? (totalPoints / 1e6).toFixed(1) + "m" :
      totalPoints > 1e3 ? (totalPoints / 1e3).toFixed(1) + "k" :
      String(totalPoints);
    const secs = Math.floor((performance.now() - simStartTime) / 1000);
    const m = Math.floor(secs / 60), s = secs % 60;
    uptimeVal.textContent = `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function loop() {
    stepAndAccumulate();
    render();
    frameCount++;
    if (frameCount % 15 === 0) updateStats();
    requestAnimationFrame(loop);
  }

  // --- UI wiring -----------------------------------------------------------
  familySelect.addEventListener("change", () => {
    activeSeed = null;
    familyKey = familySelect.value;
    resetSim(null);
  });

  paletteSelect.addEventListener("change", () => {
    paletteMode = paletteSelect.value;
    paletteVal.textContent = currentPaletteKey();
    updateSpeciesPanel();
  });

  function wireParamSlider(rangeEl, valEl, key) {
    rangeEl.addEventListener("input", () => {
      activeSeed = null;
      params[key] = parseFloat(rangeEl.value);
      valEl.textContent = params[key].toFixed(2);
      fitTransform();
      density.fill(0);
      runningMax = 1;
      totalPoints = 0;
      updateSpeciesPanel();
    });
  }
  wireParamSlider(aRange, aVal, "a");
  wireParamSlider(bRange, bVal, "b");
  wireParamSlider(cRange, cVal, "c");
  wireParamSlider(dRange, dVal, "d");

  walkersRange.addEventListener("input", () => {
    walkersVal.textContent = walkersRange.value;
  });
  walkersRange.addEventListener("change", () => {
    numWalkers = parseInt(walkersRange.value, 10);
    seedWalkers();
  });

  exposureRange.addEventListener("input", () => {
    exposure = parseFloat(exposureRange.value);
    exposureVal.textContent = exposure.toFixed(2);
  });

  randomizeBtn.addEventListener("click", () => {
    handleInput.value = "";
    resetSim(recipeFromRng(Math.random));
  });
  resetBtn.addEventListener("click", () => {
    fitTransform();
    density.fill(0);
    runningMax = 1;
    totalPoints = 0;
    simStartTime = performance.now();
  });
  handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") resetSim("input");
  });
  handleInput.addEventListener("change", () => resetSim("input"));

  // --- Drag-to-pan, scroll-to-zoom -----------------------------------------
  // The density buffer is a fixed grid in sim-pixel space, not a map of
  // attractor-space coordinates — so panning/zooming has to reset the
  // accumulation the same way changing a param or family already does,
  // otherwise old deposits stay put under the new mapping and the shape
  // visibly smears instead of just moving.
  function clearAccumulation() {
    density.fill(0);
    runningMax = 1;
    totalPoints = 0;
    simStartTime = performance.now();
  }

  function canvasToSim(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * simW,
      y: ((clientY - rect.top) / rect.height) * simH,
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const p = canvasToSim(clientX, clientY);
    const ax = transform.cx + (p.x - simW / 2) / transform.scale;
    const ay = transform.cy + (p.y - simH / 2) / transform.scale;
    const newScale = Math.min(1e6, Math.max(1e-3, transform.scale * factor));
    transform = {
      scale: newScale,
      cx: ax - (p.x - simW / 2) / newScale,
      cy: ay - (p.y - simH / 2) / newScale,
    };
    clearAccumulation();
  }

  let dragging = false;
  let lastSim = null;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastSim = canvasToSim(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = canvasToSim(e.clientX, e.clientY);
    const dx = p.x - lastSim.x, dy = p.y - lastSim.y;
    if (dx || dy) {
      transform.cx -= dx / transform.scale;
      transform.cy -= dy / transform.scale;
      clearAccumulation();
      lastSim = p;
    }
  });
  function endDrag() {
    dragging = false;
    lastSim = null;
    canvas.style.cursor = "grab";
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.style.cursor = "grab";

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(e.clientX, e.clientY, factor);
    },
    { passive: false }
  );

  // --- Sharing -------------------------------------------------------------
  // A permalink encodes the exact recipe (family, a/b/c/d, palette, walkers)
  // so a shared link reproduces the same shape instead of the recipient
  // having to re-type a handle to get it back.
  function buildPermalink() {
    const params2 = new URLSearchParams();
    params2.set("palette", currentPaletteKey());
    params2.set("walkers", String(numWalkers));
    // A handle-seeded shape gets its own real path (/s/<seed>) instead of a
    // query param on the root — the Worker's renderShare gives that path a
    // personalized og:title/og:description per seed, so every share unfurls
    // with its own preview instead of every link showing one generic card.
    if (activeSeed) return `${SITE_URL}/s/${encodeURIComponent(activeSeed.text)}?${params2.toString()}`;
    params2.set("family", familyKey);
    params2.set("a", params.a.toFixed(3));
    params2.set("b", params.b.toFixed(3));
    params2.set("c", params.c.toFixed(3));
    params2.set("d", params.d.toFixed(3));
    return `${SITE_URL}/?${params2.toString()}`;
  }

  function buildShareText() {
    const link = buildPermalink();
    if (activeSeed) {
      return `my attractor, "${activeSeed.common}" (seeded from ${activeSeed.text}, ${FAMILIES[familyKey].label}) — grow your own: ${link}`;
    }
    return `watching a ${FAMILIES[familyKey].label} strange attractor draw itself, live: ${link}`;
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
    const palette = q.get("palette");
    if (palette && (palette === "auto" || PALETTES[palette])) {
      paletteMode = palette;
      paletteSelect.value = palette;
    }
    const walkers = parseInt(q.get("walkers"), 10);
    if (Number.isFinite(walkers) && walkers >= 100 && walkers <= 3000) {
      numWalkers = walkers;
      walkersRange.value = String(walkers);
      walkersVal.textContent = String(walkers);
    }
    const pathSeed = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
    const seed = q.get("seed") || (pathSeed && decodeURIComponent(pathSeed[1]));
    if (seed) {
      handleInput.value = seed.slice(0, 60);
      return "input";
    }
    const family = q.get("family");
    if (family && FAMILIES[family]) {
      const a = parseFloat(q.get("a")), b = parseFloat(q.get("b"));
      const c = parseFloat(q.get("c")), d = parseFloat(q.get("d"));
      if ([a, b, c, d].every(Number.isFinite)) {
        return { family, a, b, c, d };
      }
    }
    return null;
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

    c.fillStyle = "rgba(4,5,10,0.55)";
    c.fillRect(0, ch - 190, cw, 190);

    c.textAlign = "left";
    c.fillStyle = "#eef2ff";
    c.font = "800 46px monospace";
    c.fillText("attractors", 48, ch - 128);

    c.fillStyle = "#ffcf4d";
    c.font = "700 30px monospace";
    if (activeSeed) {
      c.fillText(`"${activeSeed.common}" — seeded from ${activeSeed.text}`, 48, ch - 82);
    } else {
      c.fillText(`a ${FAMILIES[familyKey].label} strange attractor`, 48, ch - 82);
    }

    c.fillStyle = "#8f9dff";
    c.font = "700 26px monospace";
    c.fillText(`${FAMILIES[familyKey].label} · ${currentPaletteKey()} palette`, 48, ch - 44);

    c.fillStyle = "#94a0c2";
    c.font = "600 22px monospace";
    c.textAlign = "right";
    c.fillText("attractors.bisks.net", cw - 40, ch - 44);
    c.textAlign = "left";

    shareCanvas.toBlob((blob) => cb(blob), "image/png");
  }

  shareCardBtn.addEventListener("click", () => {
    buildShareCard(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "attractor.png", { type: "image/png" });
      if (canShareFiles()) {
        try {
          await navigator.share({ files: [file], text: buildShareText(), title: "attractors" });
          return;
        } catch {
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "attractor.png";
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
      fitTransform();
      seedWalkers();
      density.fill(0);
      runningMax = 1;
    }, 300);
  });

  resizeCanvas();
  allocateSim();
  const urlRecipe = applyUrlParams();
  if (urlRecipe === "input") {
    resetSim("input");
  } else if (urlRecipe) {
    resetSim(urlRecipe);
  } else {
    resetSim(recipeFromRng(Math.random));
  }
  refreshShareLink();
  setInterval(refreshShareLink, 1000);
  loop();
})();

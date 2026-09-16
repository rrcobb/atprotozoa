// sandpile — a live abelian sandpile toppling automaton.
//
// The model (Bak-Tang-Wiesenfeld, 1987): a grid of cells, each holding a
// non-negative integer number of chips. Any cell holding 4 or more chips is
// unstable and "topples": it loses 4 chips and gives 1 to each of its four
// grid-neighbors (edge cells lose the chips that would go off-grid — an
// "open boundary," the standard construction that keeps the process always
// terminating). A topple can push a neighbor to 4+ and trigger its own
// topple, cascading. The remarkable fact that makes this "abelian": the
// final stable configuration doesn't depend on what order you process
// unstable cells in — so the same starting pile always settles into the
// same shape, which is what makes handle-seeding meaningful here (unlike a
// chaotic sim, there's no sensitivity to float rounding to worry about).
//
// This runs the cascade as one topple-event per queue-pop, animated a batch
// at a time per frame, so the wavefront visibly grows outward rather than
// jumping straight to the fixed point.
//
// Optionally seeded from a Bluesky handle (hashed client-side, no network
// call) so the same handle always grows the same pile shape and gets a
// deterministic name.

(function () {
  "use strict";

  const SITE_URL = "https://sandpile.bisks.net";

  // --- Palettes: 5 colors — heights 0,1,2,3, and "hot" (4+, mid-cascade) ---
  const PALETTES = {
    clay: ["#241a12", "#6b4326", "#b0713a", "#e8b86d", "#ff8a5c"],
    dune: ["#1c1812", "#4a3f2c", "#8f7a4d", "#e3d3a0", "#fff1c2"],
    ember: ["#150808", "#4a1414", "#a12f1f", "#e8622a", "#ffcf4d"],
    glacier: ["#0a1218", "#1f3a4a", "#3f7a94", "#a6d8e8", "#eafcff"],
  };
  const PALETTE_KEYS = Object.keys(PALETTES);

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

  const PILE_ADJ = [
    "Teetering", "Undisturbed", "Restless", "Brimming", "Precarious",
    "Sifting", "Idle", "Overladen", "Loose", "Settling", "Hushed",
    "Errant", "Ponderous", "Slumping", "Windswept", "Patient", "Sunken",
    "Cascading", "Level", "Wandering",
  ];
  const PILE_NOUN = [
    "Cairn", "Drift", "Dune", "Scree", "Heap", "Talus", "Mound", "Accretion",
    "Deposit", "Bank", "Shoal", "Berm", "Ridge", "Slump", "Reserve",
    "Windrow", "Barrow", "Silt", "Grade", "Terrace",
  ];

  // --- DOM ---------------------------------------------------------------
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shareCanvas = document.getElementById("shareCanvas");

  const dropRange = document.getElementById("drop-range");
  const dropVal = document.getElementById("drop-val");
  const gridRange = document.getElementById("grid-range");
  const gridVal = document.getElementById("grid-val");
  const paletteSelect = document.getElementById("palette-select");
  const paletteVal = document.getElementById("palette-val");
  const handleInput = document.getElementById("handle-input");
  const pilenameBox = document.getElementById("pilename");
  const pilenameName = document.getElementById("pilename-name");
  const pilenameSub = document.getElementById("pilename-sub");
  const growBtn = document.getElementById("grow-btn");
  const megaBtn = document.getElementById("mega-btn");
  const resetBtn = document.getElementById("reset-btn");
  const shareBskyLink = document.getElementById("share-bsky");
  const shareCardBtn = document.getElementById("share-card-btn");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const chipsVal = document.getElementById("chips-val");
  const topplesVal = document.getElementById("topples-val");
  const spilledVal = document.getElementById("spilled-val");
  const uptimeVal = document.getElementById("uptime-val");
  const panel = document.getElementById("panel");
  const panelToggle = document.getElementById("panel-toggle");

  panelToggle.addEventListener("click", () => panel.classList.toggle("collapsed"));

  // The cee.wtf secret handle-prefill link — see notes/ideas history, added
  // 2026-08-28 as a standing order for every site with a handle input.
  document.getElementById("secret-a").addEventListener("click", () => {
    const el = handleInput;
    el.value = "@cee.wtf";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.focus();
  });

  // --- Grid state ------------------------------------------------------------
  let gridN = parseInt(gridRange.value, 10); // square grid, forced odd for a true center cell
  let grid = null; // Int32Array, row-major, height per cell (transiently 4+ before toppling)
  let queue = []; // growable FIFO of unstable cell indices — a cascade's total
  // enqueue count isn't boundable by grid size alone (a single massive pile
  // can requeue the same cell thousands of times before it drains), so this
  // has to grow rather than risk a fixed-size typed array silently dropping
  // writes past its length.
  let qHead = 0;
  let dropSize = parseInt(dropRange.value, 10);
  let paletteMode = paletteSelect.value; // "auto" or an explicit key
  let activeSeed = null; // { text, hash, points, palette, name } | null
  let totalChips = 0, totalTopples = 0, spilled = 0;
  let simStartTime = performance.now();
  let frameCount = 0;
  let offscreen = document.createElement("canvas");
  let offCtx = offscreen.getContext("2d", { alpha: false });
  let imgData = null;

  // Perf cap, not a default-caution one: every unstable cell gets one topple
  // operation processed per frame-batch, and every cell in the grid gets
  // repainted into the ImageData buffer every frame regardless of whether it
  // changed. 320x320 = 102400 cells keeps both of those comfortably under a
  // 16ms frame budget; there's no correctness reason to go bigger, only a
  // browser-perf one, so it's exposed as a slider rather than hardcoded.
  const TOPPLES_PER_FRAME = 6000;

  function forceOdd(n) {
    return n % 2 === 0 ? n + 1 : n;
  }

  function enqueue(idx) {
    queue.push(idx);
  }

  function dequeue() {
    if (qHead >= queue.length) return -1;
    const idx = queue[qHead++];
    // Compact occasionally so the backing array doesn't grow unbounded across
    // a long cascade — cheap relative to the topples themselves.
    if (qHead > 200000 && qHead * 2 > queue.length) {
      queue = queue.slice(qHead);
      qHead = 0;
    }
    return idx;
  }

  function bump(nidx) {
    grid[nidx]++;
    if (grid[nidx] === 4) enqueue(nidx);
  }

  function topple(idx) {
    grid[idx] -= 4;
    totalTopples++;
    const x = idx % gridN, y = (idx / gridN) | 0;
    if (x > 0) bump(idx - 1); else spilled++;
    if (x < gridN - 1) bump(idx + 1); else spilled++;
    if (y > 0) bump(idx - gridN); else spilled++;
    if (y < gridN - 1) bump(idx + gridN); else spilled++;
  }

  function processBatch(n) {
    for (let i = 0; i < n; i++) {
      const idx = dequeue();
      if (idx < 0) return;
      if (grid[idx] < 4) continue; // already resolved by an earlier duplicate pop
      topple(idx);
      if (grid[idx] >= 4) enqueue(idx);
    }
  }

  function isSettling() {
    return qHead < queue.length;
  }

  // Add `amount` chips at grid coords (gx, gy) in one shot. Used for both
  // clicks and seeded/mega drops.
  function dropAt(gx, gy, amount) {
    gx = Math.max(0, Math.min(gridN - 1, gx | 0));
    gy = Math.max(0, Math.min(gridN - 1, gy | 0));
    const idx = gy * gridN + gx;
    grid[idx] += amount;
    totalChips += amount;
    if (grid[idx] >= 4) enqueue(idx);
  }

  // Re-derive a seed's chip count/drop points/auto-palette/pile name from its
  // hash, consuming a fixed draw order so the same handle always reproduces
  // the same pile (mirrors cymatics's resolveSeed).
  function resolveSeed(text) {
    const hash = hashString(text.trim().toLowerCase());
    const rng = mulberry32(hash);
    const area = gridN * gridN;
    const mainChips = Math.round(area * (0.15 + rng() * 0.9));
    const extraCount = Math.floor(rng() * 3); // 0-2 extra piles besides the center
    const points = [{ dx: 0, dy: 0, chips: mainChips }];
    for (let i = 0; i < extraCount; i++) {
      const radius = (0.15 + rng() * 0.35) * gridN;
      const angle = rng() * Math.PI * 2;
      points.push({
        dx: Math.round(Math.cos(angle) * radius),
        dy: Math.round(Math.sin(angle) * radius),
        chips: Math.round(mainChips * (0.2 + rng() * 0.35)),
      });
    }
    const palette = PALETTE_KEYS[Math.floor(rng() * PALETTE_KEYS.length)];
    const adj = PILE_ADJ[Math.floor(rng() * PILE_ADJ.length)];
    const noun = PILE_NOUN[Math.floor(rng() * PILE_NOUN.length)];
    return { text: text.trim(), hash, points, palette, name: `${adj} ${noun}` };
  }

  function currentPaletteKey() {
    if (paletteMode !== "auto") return paletteMode;
    if (activeSeed) return activeSeed.palette;
    return "clay";
  }

  function updatePilenamePanel() {
    if (!activeSeed) {
      pilenameBox.classList.remove("show");
      return;
    }
    pilenameBox.classList.add("show");
    pilenameName.textContent = `⛰️ "${activeSeed.name}"`;
    pilenameSub.textContent = `grown from ${activeSeed.text} · ${activeSeed.points.length} drop${activeSeed.points.length === 1 ? "" : "s"}`;
  }

  function allocateGrid() {
    grid = new Int32Array(gridN * gridN);
    queue = [];
    qHead = 0;
    offscreen.width = gridN;
    offscreen.height = gridN;
    offCtx.imageSmoothingEnabled = false;
    imgData = offCtx.createImageData(gridN, gridN);
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
  }

  function clearGrid() {
    grid.fill(0);
    queue.length = 0;
    qHead = 0;
    totalChips = 0;
    totalTopples = 0;
    spilled = 0;
    simStartTime = performance.now();
  }

  function resetSim(applySeedFromInput) {
    if (applySeedFromInput) {
      const raw = handleInput.value.trim();
      activeSeed = raw ? resolveSeed(raw) : null;
    }
    allocateGrid();
    clearGrid();
    const center = (gridN - 1) / 2;
    if (activeSeed) {
      for (const p of activeSeed.points) {
        dropAt(center + p.dx, center + p.dy, p.chips);
      }
    } else {
      // Default: a single unseeded center pile, big enough to already be
      // mid-cascade the moment the page loads — a first pass that's already
      // alive rather than a blank grid waiting for a click.
      dropAt(center, center, Math.round(gridN * gridN * 0.35));
    }
    updatePilenamePanel();
    paletteVal.textContent = currentPaletteKey();
  }

  // --- Rendering -----------------------------------------------------------
  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  const RGB_CACHE = {};
  for (const key of PALETTE_KEYS) RGB_CACHE[key] = PALETTES[key].map(hexToRgb);

  function render() {
    const paletteKey = currentPaletteKey();
    const colors = RGB_CACHE[paletteKey];
    const data = imgData.data;
    const n = gridN * gridN;
    for (let i = 0; i < n; i++) {
      const h = grid[i];
      const c = h >= 4 ? colors[4] : colors[h < 0 ? 0 : h];
      const o = i * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
    }
    offCtx.putImageData(imgData, 0, 0);

    // Letterbox the square grid centered in the (possibly non-square) canvas,
    // background-filled outside it — same inscribed-square approach as
    // cymatics's plate, just with a square domain instead of a round one.
    const bg = PALETTES[paletteKey][0];
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const size = Math.min(canvas.width, canvas.height);
    const ox = (canvas.width - size) / 2, oy = (canvas.height - size) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, gridN, gridN, ox, oy, size, size);
  }

  function updateStats() {
    chipsVal.textContent = totalChips.toLocaleString();
    topplesVal.textContent = totalTopples.toLocaleString();
    spilledVal.textContent = spilled.toLocaleString();
    const secs = Math.floor((performance.now() - simStartTime) / 1000);
    const mm = Math.floor(secs / 60), ss = secs % 60;
    uptimeVal.textContent = `${mm}:${ss < 10 ? "0" : ""}${ss}`;
  }

  let rafId = null;
  function loop() {
    if (isSettling()) processBatch(TOPPLES_PER_FRAME);
    render();
    frameCount++;
    if (frameCount % 15 === 0) updateStats();
    rafId = requestAnimationFrame(loop);
  }

  // --- Pointer: drop chips ---------------------------------------------------
  let pointerDown = false;
  let lastDropCell = -1;

  function canvasToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cssSize = Math.min(rect.width, rect.height);
    const ox = (rect.width - cssSize) / 2, oy = (rect.height - cssSize) / 2;
    const px = clientX - rect.left - ox;
    const py = clientY - rect.top - oy;
    if (px < 0 || py < 0 || px >= cssSize || py >= cssSize) return null;
    const gx = Math.floor((px / cssSize) * gridN);
    const gy = Math.floor((py / cssSize) * gridN);
    return { gx, gy };
  }

  function dropAtPointer(clientX, clientY) {
    const g = canvasToGrid(clientX, clientY);
    if (!g) return;
    const idx = g.gy * gridN + g.gx;
    if (idx === lastDropCell) return; // avoid re-dropping every pointermove tick on the same cell
    lastDropCell = idx;
    dropAt(g.gx, g.gy, dropSize);
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointerDown = true;
    lastDropCell = -1;
    dropAtPointer(e.clientX, e.clientY);
  });
  window.addEventListener("pointermove", (e) => {
    if (pointerDown) dropAtPointer(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", () => {
    pointerDown = false;
  });

  // --- UI wiring -----------------------------------------------------------
  dropRange.addEventListener("input", () => {
    dropSize = parseInt(dropRange.value, 10);
    dropVal.textContent = String(dropSize);
  });

  gridRange.addEventListener("input", () => { gridVal.textContent = gridRange.value; });
  gridRange.addEventListener("change", () => {
    gridN = forceOdd(parseInt(gridRange.value, 10));
    resetSim(false);
  });

  paletteSelect.addEventListener("change", () => {
    paletteMode = paletteSelect.value;
    paletteVal.textContent = currentPaletteKey();
  });

  growBtn.addEventListener("click", () => resetSim(true));
  megaBtn.addEventListener("click", () => {
    const center = (gridN - 1) / 2;
    dropAt(center, center, Math.round(gridN * gridN * 1.5));
  });
  resetBtn.addEventListener("click", () => {
    activeSeed = null;
    handleInput.value = "";
    clearGrid();
    updatePilenamePanel();
  });
  handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") resetSim(true);
  });

  // --- Sharing -------------------------------------------------------------
  function buildPermalink() {
    const params = new URLSearchParams();
    if (activeSeed) params.set("seed", activeSeed.text);
    params.set("grid", String(gridN));
    params.set("palette", currentPaletteKey());
    return `${SITE_URL}/?${params.toString()}`;
  }

  function buildShareText() {
    const link = buildPermalink();
    if (activeSeed) {
      return `my sandpile, "${activeSeed.name}" (seeded from ${activeSeed.text}, ${totalTopples.toLocaleString()} topples so far) — grow your own: ${link}`;
    }
    return `watching an abelian sandpile cascade into a fractal live in the browser (${totalTopples.toLocaleString()} topples, ${currentPaletteKey()} palette): ${link}`;
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
    const gridQ = parseInt(q.get("grid"), 10);
    if (Number.isFinite(gridQ) && gridQ >= 100 && gridQ <= 320) {
      gridN = forceOdd(gridQ);
      gridRange.value = String(gridQ);
      gridVal.textContent = String(gridQ);
    }
    const palette = q.get("palette");
    if (palette && (palette === "auto" || PALETTES[palette])) {
      paletteMode = palette;
      paletteSelect.value = palette;
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

    c.fillStyle = "rgba(10,8,5,0.6)";
    c.fillRect(0, ch - 190, cw, 190);

    c.textAlign = "left";
    c.fillStyle = "#fbf3e6";
    c.font = "800 46px monospace";
    c.fillText("sandpile", 48, ch - 128);

    c.fillStyle = "#ff8a5c";
    c.font = "700 30px monospace";
    if (activeSeed) {
      c.fillText(`"${activeSeed.name}" — seeded from ${activeSeed.text}`, 48, ch - 82);
    } else {
      c.fillText(`an abelian sandpile cascades into a fractal`, 48, ch - 82);
    }

    c.fillStyle = "#e8b86d";
    c.font = "700 26px monospace";
    c.fillText(`${totalTopples.toLocaleString()} topples · ${currentPaletteKey()} palette`, 48, ch - 44);

    c.fillStyle = "#b3a48c";
    c.font = "600 22px monospace";
    c.textAlign = "right";
    c.fillText("sandpile.bisks.net", cw - 40, ch - 44);
    c.textAlign = "left";

    shareCanvas.toBlob((blob) => cb(blob), "image/png");
  }

  shareCardBtn.addEventListener("click", () => {
    buildShareCard(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "sandpile.png", { type: "image/png" });
      if (canShareFiles()) {
        try {
          await navigator.share({ files: [file], text: buildShareText(), title: "sandpile" });
          return;
        } catch {
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sandpile.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  });

  // --- Bootstrap -----------------------------------------------------------
  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }

  window.addEventListener("resize", resizeCanvas);

  gridN = forceOdd(gridN);
  resizeCanvas();
  const hasSeedFromUrl = applyUrlParams();
  resetSim(hasSeedFromUrl);
  refreshShareLink();
  setInterval(refreshShareLink, 1000);
  loop();
})();

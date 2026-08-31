// petalgarden — a grid of petal-projection knot diagrams.
//
// A petal projection draws a knot as one closed strand that passes through a
// single point N times (like N petals meeting at a center). The order the N
// passes stack at that point — a permutation of 1..N — is what makes two
// petal diagrams different knots even with the same N. Each card here is a
// fresh random permutation of the same N, physically relaxed each frame
// (verlet integration: a shape-restoring spring + neighbor-averaging "bending"
// force + an inextensible-rope length constraint, plus a little per-point
// noise) so the loops wobble and settle like real string instead of sitting
// frozen as math.

(() => {
  const SAMPLES_PER_PETAL = 18;
  const MAX_CELLS = 36; // 6x6 — see wireControls(): every cell repaints its own
  // canvas every frame, so this is a real device-paint-cost cap (not a
  // reflexive default), independent of the physics itself, which is O(points)
  // per knot and stays cheap however big N or the grid gets.

  // ---- seeded RNG (mulberry32) -------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cellSeed(masterSeed, index) {
    return (masterSeed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  }

  function randomPermutation(n, rng) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  // Angular multiplier: how many "slots" the curve advances per petal. Must
  // be coprime with n so the n petals fill all n evenly-spaced angular slots
  // exactly once (a proper {n/k} star-flower) instead of overlapping/skipping.
  function petalMultiplier(n) {
    for (let k = Math.floor(n / 2); k >= 1; k--) {
      if (gcd(k, n) === 1) return k;
    }
    return 1;
  }

  // ---- ideal petal curve ---------------------------------------------------
  // Builds the closed, ordered point list for a petal projection with `n`
  // petals: unit-radius rose-style curve, radius -> 0 exactly at each integer
  // t (that's the single shared crossing point all n passes go through).
  function buildIdealCurve(n) {
    const k = petalMultiplier(n);
    const total = n * SAMPLES_PER_PETAL;
    const pts = new Array(total);
    const petalOf = new Uint16Array(total);
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < SAMPLES_PER_PETAL; s++) {
        const u = s / SAMPLES_PER_PETAL; // 0..1 within this petal
        const t = i + u;
        const angle = (2 * Math.PI * k * t) / n;
        const radius = Math.sin(Math.PI * u); // 0 -> 1 -> 0 per petal
        const idx = i * SAMPLES_PER_PETAL + s;
        pts[idx] = [radius * Math.cos(angle), radius * Math.sin(angle)];
        petalOf[idx] = i;
      }
    }
    return { pts, petalOf, total, n };
  }

  // ---- a single animated knot ----------------------------------------------
  class Knot {
    constructor(n, seed, color) {
      this.n = n;
      this.color = color;
      const rng = mulberry32(seed);
      this.permutation = randomPermutation(n, rng);
      const curve = buildIdealCurve(n);
      this.total = curve.total;
      this.petalOf = curve.petalOf;
      this.target = curve.pts;
      this.pos = curve.pts.map((p) => [p[0], p[1]]);
      this.prev = curve.pts.map((p) => [p[0], p[1]]);
      this.restLen = new Array(this.total);
      for (let i = 0; i < this.total; i++) {
        const a = curve.pts[i];
        const b = curve.pts[(i + 1) % this.total];
        this.restLen[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      // per-point noise phase/frequency so the wobble reads as organic
      // jitter rather than one uniform pulse.
      this.freq = new Array(this.total);
      this.phase = new Array(this.total);
      for (let i = 0; i < this.total; i++) {
        this.freq[i] = 0.4 + rng() * 0.5;
        this.phase[i] = rng() * Math.PI * 2;
      }
    }

    step(t, dt) {
      const L = this.total;
      const kRestore = 0.02;
      const noiseAmp = 0.012;
      const damping = 0.97;
      const dt2 = dt * dt;

      for (let i = 0; i < L; i++) {
        const p = this.pos[i];
        const pr = this.prev[i];
        const vx = (p[0] - pr[0]) * damping;
        const vy = (p[1] - pr[1]) * damping;
        const tgt = this.target[i];
        const ax = (tgt[0] - p[0]) * kRestore + Math.sin(t * this.freq[i] + this.phase[i]) * noiseAmp;
        const ay = (tgt[1] - p[1]) * kRestore + Math.cos(t * this.freq[i] * 0.9 + this.phase[i]) * noiseAmp;
        const nx = p[0] + vx + ax * dt2;
        const ny = p[1] + vy + ay * dt2;
        pr[0] = p[0];
        pr[1] = p[1];
        p[0] = nx;
        p[1] = ny;
      }

      // bending: pull each point toward the average of its neighbors
      // (curvature-reduction / elastic bending energy).
      const bendCopy = this.pos.map((p) => [p[0], p[1]]);
      const kBend = 0.06;
      for (let i = 0; i < L; i++) {
        const a = bendCopy[(i - 1 + L) % L];
        const b = bendCopy[(i + 1) % L];
        const p = this.pos[i];
        p[0] += ((a[0] + b[0]) / 2 - p[0]) * kBend;
        p[1] += ((a[1] + b[1]) / 2 - p[1]) * kBend;
      }

      // inextensible-rope constraint: keep each segment near its ideal
      // length so the loop can't stretch or collapse indefinitely.
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < L; i++) {
          const j = (i + 1) % L;
          const a = this.pos[i];
          const b = this.pos[j];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const dist = Math.hypot(dx, dy) || 1e-6;
          const diff = ((dist - this.restLen[i]) / dist) * 0.5;
          a[0] += dx * diff;
          a[1] += dy * diff;
          b[0] -= dx * diff;
          b[1] -= dy * diff;
        }
      }
    }

    draw(ctx, size) {
      const scale = size * 0.42;
      const cx = size / 2;
      const cy = size / 2;
      const strokeW = Math.max(2, size * 0.018);
      const haloW = strokeW + Math.max(3, size * 0.02);

      const order = this.permutation
        .map((height, petal) => ({ height, petal }))
        .sort((a, b) => a.height - b.height);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Halo-then-color, per petal, lowest height first: each strand's wide
      // background-colored halo punches a gap through every strand already
      // drawn beneath it before its own narrower colored line goes on top —
      // that's what makes the higher-permutation strand read as "over" at a
      // crossing. Batching all halos before all colors (as an earlier draft
      // did) loses the gap: the last color stroke would only erase a sliver
      // exactly its own width, not the wider halo margin.
      for (const { petal } of order) {
        const start = petal * SAMPLES_PER_PETAL;
        ctx.beginPath();
        for (let s = 0; s <= SAMPLES_PER_PETAL; s++) {
          const idx = (start + s) % this.total;
          const p = this.pos[idx];
          const x = cx + p[0] * scale;
          const y = cy + p[1] * scale;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "#141b22"; // card background — punches the "gap"
        ctx.lineWidth = haloW;
        ctx.stroke();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = strokeW;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = size * 0.03;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }

  // ---- garden (grid of knots) ----------------------------------------------
  const PALETTE = ["#ff8a7b", "#7bd88f", "#ffd166", "#a78bfa", "#66d1e0", "#f78fb3", "#e8c07d", "#7ba8ff"];

  const grid = document.getElementById("grid");
  const nSlider = document.getElementById("nSlider");
  const nLabel = document.getElementById("nLabel");
  const gridSelect = document.getElementById("gridSelect");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const saveBtn = document.getElementById("saveBtn");
  const shareBtn = document.getElementById("shareBtn");

  let state = { n: 7, cols: 3, seed: (Math.random() * 0xffffffff) >>> 0 };
  let knots = [];
  let canvases = [];
  let paused = false;
  let rafId = null;
  let lastT = 0;

  // ---- click-and-drag: grab the nearest strand point and pin it to the
  // pointer each frame; the bending + rope-length constraints in Knot.step()
  // pull the rest of the loop along elastically, same as tugging real string.
  // Keyed by pointerId so multiple fingers/mice can drag different knots (or
  // different points of the same knot) at once.
  const drags = new Map();
  const GRAB_PX = 22; // how close (in css px) a click needs to be to a strand

  function localCoords(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }

  function toUnit(size, lx, ly) {
    const scale = size * 0.42; // matches Knot.draw()'s scale/cx/cy
    return [(lx - size / 2) / scale, (ly - size / 2) / scale, scale];
  }

  function nearestPointIndex(knot, ux, uy, maxUnitDist) {
    let best = -1;
    let bestD2 = maxUnitDist * maxUnitDist;
    for (let i = 0; i < knot.total; i++) {
      const p = knot.pos[i];
      const dx = p[0] - ux;
      const dy = p[1] - uy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  function readStateFromURL() {
    const p = new URLSearchParams(location.search);
    const n = parseInt(p.get("n"), 10);
    const g = parseInt(p.get("grid"), 10);
    const s = parseInt(p.get("seed"), 10);
    if (Number.isFinite(n) && n >= 3 && n <= 13) state.n = n;
    if (Number.isFinite(g) && g >= 2 && g <= 6) state.cols = g;
    if (Number.isFinite(s)) state.seed = s >>> 0;
  }

  function writeStateToURL() {
    const p = new URLSearchParams();
    p.set("n", state.n);
    p.set("grid", state.cols);
    p.set("seed", state.seed);
    history.replaceState(null, "", "?" + p.toString());
  }

  function buildGarden() {
    grid.innerHTML = "";
    knots = [];
    canvases = [];
    drags.clear();
    const count = Math.min(state.cols * state.cols, MAX_CELLS);
    const cellPx = state.cols <= 3 ? 220 : state.cols <= 4 ? 180 : 140;
    grid.style.gridTemplateColumns = `repeat(${state.cols}, ${cellPx}px)`;

    const inner = cellPx - 16; // card has 8px padding on each side

    for (let i = 0; i < count; i++) {
      const card = document.createElement("div");
      card.className = "knot-card";
      card.style.width = cellPx + "px";
      card.style.height = cellPx + "px";
      const canvas = document.createElement("canvas");
      const dpr = window.devicePixelRatio || 1;
      canvas.width = inner * dpr;
      canvas.height = inner * dpr;
      canvas.style.width = inner + "px";
      canvas.style.height = inner + "px";
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      canvas.style.cursor = "grab";
      canvas.style.touchAction = "none";
      card.appendChild(canvas);
      grid.appendChild(card);

      const knot = new Knot(state.n, cellSeed(state.seed, i), PALETTE[i % PALETTE.length]);
      knots.push(knot);
      canvases.push({ canvas, ctx, size: inner });

      const knotIndex = i;
      canvas.addEventListener("pointerdown", (e) => {
        const [lx, ly] = localCoords(canvas, e.clientX, e.clientY);
        const [ux, uy, scale] = toUnit(inner, lx, ly);
        const idx = nearestPointIndex(knots[knotIndex], ux, uy, GRAB_PX / scale);
        if (idx === -1) return;
        drags.set(e.pointerId, { i: knotIndex, pointIndex: idx, ux, uy });
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
        e.preventDefault();
      });
      canvas.addEventListener("pointermove", (e) => {
        const d = drags.get(e.pointerId);
        if (!d || d.i !== knotIndex) return;
        const [lx, ly] = localCoords(canvas, e.clientX, e.clientY);
        const [ux, uy] = toUnit(inner, lx, ly);
        d.ux = ux;
        d.uy = uy;
        e.preventDefault();
      });
      const releaseDrag = (e) => {
        if (!drags.has(e.pointerId)) return;
        drags.delete(e.pointerId);
        canvas.style.cursor = "grab";
      };
      canvas.addEventListener("pointerup", releaseDrag);
      canvas.addEventListener("pointercancel", releaseDrag);
    }
    writeStateToURL();
    updateShareLink();
  }

  function frame(tMs) {
    const t = tMs / 1000;
    const dt = lastT ? Math.min(0.05, t - lastT) : 0.016;
    lastT = t;
    if (!paused) {
      for (const knot of knots) knot.step(t, dt);
    } else if (drags.size) {
      // keep the physics live for whatever's being dragged even while
      // paused, so tugging a strand still pulls its neighbors along.
      const stepped = new Set();
      for (const d of drags.values()) {
        if (stepped.has(d.i)) continue;
        stepped.add(d.i);
        knots[d.i].step(t, dt);
      }
    }
    // pin every actively-dragged point to its pointer, on top of whatever
    // the spring/bending/rope-length solve just computed for it.
    for (const d of drags.values()) {
      const p = knots[d.i].pos[d.pointIndex];
      p[0] = d.ux;
      p[1] = d.uy;
    }
    for (let i = 0; i < knots.length; i++) {
      const { ctx, size } = canvases[i];
      ctx.clearRect(0, 0, size, size);
      knots[i].draw(ctx, size);
    }
    rafId = requestAnimationFrame(frame);
  }

  function updateShareLink() {
    const url = new URL(location.href);
    const text = `grew a garden of ${state.n}-petal knots, one random permutation per card 🌸\n${url.toString()}`;
    shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  }

  function compositeImage() {
    const dpr = window.devicePixelRatio || 1;
    const gap = 14;
    const cols = state.cols;
    const rows = Math.ceil(canvases.length / cols);
    const cellPx = canvases[0].size;
    const out = document.createElement("canvas");
    out.width = (cellPx * cols + gap * (cols + 1)) * dpr;
    out.height = (cellPx * rows + gap * (rows + 1)) * dpr;
    const octx = out.getContext("2d");
    octx.scale(dpr, dpr);
    octx.fillStyle = "#0b0f13";
    octx.fillRect(0, 0, out.width / dpr, out.height / dpr);
    canvases.forEach(({ canvas, size }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gap + col * (size + gap);
      const y = gap + row * (size + gap);
      octx.drawImage(canvas, 0, 0, canvas.width, canvas.height, x, y, size, size);
    });
    return out;
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

  async function handleSave() {
    const out = compositeImage();
    out.toBlob(async (blob) => {
      if (!blob) return;
      if (canShareFiles()) {
        const file = new File([blob], "petalgarden.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], title: "petalgarden", text: "a garden of random knots" });
          return;
        } catch {
          // fall through to download
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "petalgarden.png";
      a.click();
    }, "image/png");
  }

  function wireControls() {
    nSlider.value = state.n;
    nLabel.textContent = state.n;
    gridSelect.value = state.cols;

    nSlider.addEventListener("input", () => {
      state.n = parseInt(nSlider.value, 10);
      nLabel.textContent = state.n;
    });
    nSlider.addEventListener("change", buildGarden);

    gridSelect.addEventListener("change", () => {
      state.cols = parseInt(gridSelect.value, 10);
      buildGarden();
    });

    shuffleBtn.addEventListener("click", () => {
      state.seed = (Math.random() * 0xffffffff) >>> 0;
      buildGarden();
    });

    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.textContent = paused ? "▶ resume" : "⏸ pause";
    });

    saveBtn.addEventListener("click", handleSave);
  }

  readStateFromURL();
  wireControls();
  buildGarden();
  rafId = requestAnimationFrame(frame);
})();

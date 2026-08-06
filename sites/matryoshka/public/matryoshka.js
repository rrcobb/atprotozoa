// matryoshka — a digital nesting doll.
//
// Every doll is generated, not drawn once and copied: appearanceFor(seed, depth)
// hashes the seed string and the integer depth into a deterministic RNG, so the
// doll at depth 4000 looks exactly as crisp as the doll at depth 4 — there's no
// image being scaled down, so nothing to run out of precision on. Opening a doll
// just increments an integer and repaints.

(function () {
  "use strict";

  // ---------- deterministic RNG ----------

  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

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

  const PATTERNS = ["dots", "stripes", "flowers", "diamonds"];

  function appearanceFor(seedStr, depth) {
    const rng = mulberry32(hash32(seedStr + ":" + depth));
    const hue = Math.floor(rng() * 360);
    const sat = 50 + rng() * 30;
    const light = 38 + rng() * 10;
    const pattern = PATTERNS[Math.floor(rng() * PATTERNS.length)];
    const scarfShift = 25 + rng() * 90 * (rng() < 0.5 ? -1 : 1);
    const faceVariant = Math.floor(rng() * 3);
    const density = 4 + Math.floor(rng() * 4);
    const jitter = rng();
    return { depth, hue, sat, light, pattern, scarfShift, faceVariant, density, jitter };
  }

  function hsl(h, s, l) {
    return "hsl(" + ((h % 360) + 360) % 360 + "," + s.toFixed(0) + "%," + l.toFixed(0) + "%)";
  }

  // ---------- doll silhouette + rendering ----------
  // Unit space: x in [-0.34, 0.34], y in [-0.5, 0.5], drawn scaled/translated by caller.

  function bodyPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -0.5);
    ctx.bezierCurveTo(0.16, -0.5, 0.24, -0.4, 0.24, -0.29);
    ctx.bezierCurveTo(0.24, -0.24, 0.2, -0.22, 0.19, -0.18);
    ctx.bezierCurveTo(0.32, -0.1, 0.34, 0.05, 0.3, 0.16);
    ctx.bezierCurveTo(0.27, 0.28, 0.24, 0.38, 0.2, 0.46);
    ctx.bezierCurveTo(0.19, 0.49, 0.16, 0.5, 0.12, 0.5);
    ctx.lineTo(-0.12, 0.5);
    ctx.bezierCurveTo(-0.16, 0.5, -0.19, 0.49, -0.2, 0.46);
    ctx.bezierCurveTo(-0.24, 0.38, -0.27, 0.28, -0.3, 0.16);
    ctx.bezierCurveTo(-0.34, 0.05, -0.32, -0.1, -0.19, -0.18);
    ctx.bezierCurveTo(-0.2, -0.22, -0.24, -0.24, -0.24, -0.29);
    ctx.bezierCurveTo(-0.24, -0.4, -0.16, -0.5, 0, -0.5);
    ctx.closePath();
  }

  function drawFace(ctx, appearance) {
    const y = -0.32;
    ctx.fillStyle = "rgba(30,14,10,0.85)";
    ctx.beginPath();
    ctx.ellipse(-0.055, y, 0.015, 0.02, 0, 0, Math.PI * 2);
    ctx.ellipse(0.055, y, 0.015, 0.02, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(230,120,110,0.55)";
    ctx.beginPath();
    ctx.ellipse(-0.1, y + 0.045, 0.022, 0.015, 0, 0, Math.PI * 2);
    ctx.ellipse(0.1, y + 0.045, 0.022, 0.015, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(30,14,10,0.8)";
    ctx.lineWidth = 0.006;
    ctx.beginPath();
    if (appearance.faceVariant === 0) {
      ctx.arc(0, y + 0.03, 0.03, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (appearance.faceVariant === 1) {
      ctx.moveTo(-0.02, y + 0.045);
      ctx.lineTo(0.02, y + 0.045);
    } else {
      ctx.arc(0, y + 0.02, 0.022, 0.2 * Math.PI, 0.8 * Math.PI);
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(30,14,10,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, y + 0.02, 0.008, 0.006, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPattern(ctx, appearance, accent) {
    const rng = mulberry32(hash32("pattern:" + appearance.depth + ":" + appearance.jitter));
    ctx.save();
    bodyPath(ctx);
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.strokeStyle = accent;

    if (appearance.pattern === "dots") {
      const rows = appearance.density;
      for (let r = 0; r < rows; r++) {
        const y = -0.02 + (r / rows) * 0.48;
        const cols = 4 + (r % 2);
        for (let c = 0; c < cols; c++) {
          const x = -0.28 + (c / (cols - 1)) * 0.56 + (rng() - 0.5) * 0.02;
          ctx.beginPath();
          ctx.arc(x, y, 0.018, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (appearance.pattern === "stripes") {
      const bands = appearance.density;
      ctx.lineWidth = 0.03;
      for (let b = 0; b < bands; b++) {
        const y = -0.05 + (b / bands) * 0.52;
        ctx.globalAlpha = b % 2 === 0 ? 0.9 : 0.45;
        ctx.beginPath();
        ctx.moveTo(-0.34, y);
        ctx.lineTo(0.34, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (appearance.pattern === "flowers") {
      const count = appearance.density;
      for (let i = 0; i < count; i++) {
        const x = (rng() - 0.5) * 0.5;
        const y = -0.02 + rng() * 0.44;
        const petals = 5;
        for (let p = 0; p < petals; p++) {
          const a = (p / petals) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 0.022, y + Math.sin(a) * 0.022, 0.014, 0.009, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = hsl(appearance.hue + 180, 70, 70);
        ctx.beginPath();
        ctx.arc(x, y, 0.008, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = accent;
      }
    } else {
      const rows = appearance.density;
      for (let r = 0; r < rows; r++) {
        const y = -0.02 + (r / rows) * 0.48;
        const cols = 5;
        for (let c = 0; c < cols; c++) {
          if ((r + c) % 2 === 0) continue;
          const x = -0.3 + (c / (cols - 1)) * 0.6;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-0.014, -0.014, 0.028, 0.028);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  function drawDoll(ctx, cx, cy, scale, appearance, opacity) {
    if (opacity <= 0.003) return;
    const base = hsl(appearance.hue, appearance.sat, appearance.light);
    const scarf = hsl(appearance.hue + appearance.scarfShift, appearance.sat + 10, Math.max(20, appearance.light - 14));
    const accent = hsl(appearance.hue + 180, Math.min(80, appearance.sat + 20), 66);
    const outline = hsl(appearance.hue, appearance.sat * 0.6, Math.max(12, appearance.light - 28));

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    bodyPath(ctx);
    ctx.fillStyle = base;
    ctx.fill();

    drawPattern(ctx, appearance, accent);

    ctx.save();
    bodyPath(ctx);
    ctx.clip();
    ctx.fillStyle = scarf;
    ctx.beginPath();
    ctx.moveTo(-0.24, -0.29);
    ctx.bezierCurveTo(-0.24, -0.4, -0.16, -0.5, 0, -0.5);
    ctx.bezierCurveTo(0.16, -0.5, 0.24, -0.4, 0.24, -0.29);
    ctx.bezierCurveTo(0.24, -0.24, 0.2, -0.22, 0.19, -0.18);
    ctx.lineTo(-0.19, -0.18);
    ctx.bezierCurveTo(-0.2, -0.22, -0.24, -0.24, -0.24, -0.29);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.2, -0.185);
    ctx.lineTo(0.2, -0.185);
    ctx.stroke();
    ctx.restore();

    drawFace(ctx, appearance);

    bodyPath(ctx);
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = outline;
    ctx.stroke();

    ctx.restore();
  }

  // ---------- flavor text, escalating with depth ----------

  const FLAVOR = [
    [0, "a doll. inside it, presumably, another doll."],
    [1, "doll #{n}. cute. normal. nothing to see here yet."],
    [5, "doll #{n}. still just making more of itself."],
    [10, "doll #{n}. you notice it hasn't slowed down."],
    [20, "doll #{n}. exponential, and getting comfortable with it."],
    [50, "doll #{n}. this was supposed to bottom out by now."],
    [100, "doll #{n}. recursive self-improvement, but it's wood."],
    [250, "doll #{n}. every doll fully formed. no shortcuts taken."],
    [500, "doll #{n}. singularity, but make it craft fair."],
    [1000, "doll #{n}. foom achieved. it is dolls all the way down."],
    [5000, "doll #{n}. it stopped being a bit a while ago."],
  ];

  function flavorFor(n) {
    let text = FLAVOR[0][1];
    for (const [threshold, t] of FLAVOR) {
      if (n >= threshold) text = t;
    }
    return text.replace("{n}", n);
  }

  // ---------- state ----------

  const canvas = document.getElementById("stageCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const depthStat = document.getElementById("depthStat");
  const deepestStat = document.getElementById("deepestStat");
  const flavorEl = document.getElementById("flavor");
  const hintEl = document.getElementById("hint");
  const seedInput = document.getElementById("seedInput");
  const outBtn = document.getElementById("outBtn");
  const autoBtn = document.getElementById("autoBtn");
  const rerollBtn = document.getElementById("rerollBtn");
  const cardBtn = document.getElementById("cardBtn");
  const shareBluesky = document.getElementById("shareBluesky");

  const LS_KEY = "matryoshka:deepest";

  function randomSeed() {
    return Math.random().toString(36).slice(2, 8);
  }

  const params = new URLSearchParams(location.search);
  let seed = (params.get("seed") || randomSeed()).replace(/[^a-z0-9]/gi, "").slice(0, 10) || randomSeed();
  let depth = Math.max(0, Math.min(1e9, parseInt(params.get("depth"), 10) || 0));

  let animating = false;
  let autoTimer = null;

  function deepestSeen() {
    return parseInt(localStorage.getItem(LS_KEY) || "0", 10) || 0;
  }
  function noteDeepest(n) {
    if (n > deepestSeen()) localStorage.setItem(LS_KEY, String(n));
    deepestStat.textContent = String(deepestSeen());
  }

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set("seed", seed);
    u.searchParams.set("depth", String(depth));
    history.replaceState(null, "", u.toString());
  }

  function updateChrome() {
    depthStat.textContent = String(depth);
    flavorEl.innerHTML = flavorFor(depth);
    outBtn.disabled = depth === 0 || animating;
    seedInput.value = seed;
    noteDeepest(depth);
    hintEl.style.display = depth === 0 && !animating ? "" : "none";

    const shareText =
      "I'm " +
      depth +
      " doll" +
      (depth === 1 ? "" : "s") +
      " deep into my own matryoshka and it still hasn't run out of dolls. " +
      location.href;
    shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  }

  // ---------- canvas sizing ----------

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(1);
  }
  window.addEventListener("resize", resize);

  // ---------- rendering ----------

  function stageMetrics() {
    const rect = stage.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2 + 6;
    const dollHeight = Math.min(rect.height * 0.72, rect.width * 1.1);
    return { cx, cy, scale: dollHeight };
  }

  function render(t) {
    const rect = stage.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const { cx, cy, scale } = stageMetrics();

    const cur = appearanceFor(seed, depth);
    const next = appearanceFor(seed, depth + 1);
    const afterNext = appearanceFor(seed, depth + 2);

    if (!animating) {
      drawDoll(ctx, cx, cy, scale, cur, 1);
      drawDoll(ctx, cx, cy + scale * 0.14, scale * 0.3, next, 0.4);
      return;
    }

    const e = 1 - Math.pow(1 - t, 3); // ease-out cubic

    if (window.__matDirection === "in") {
      // opening: current recedes/fades, "next" (the peek) grows to fill the frame
      drawDoll(ctx, cx, cy, scale * (1 + e * 0.7), cur, 1 - e);
      drawDoll(ctx, cx, cy + scale * 0.14 * (1 - e), scale * (0.3 + e * 0.7), next, 0.4 + e * 0.6);
      if (e > 0.55) {
        const p2 = (e - 0.55) / 0.45;
        drawDoll(ctx, cx, cy + scale * 0.14 * (1 - p2), scale * 0.3 * p2, afterNext, 0.4 * p2);
      }
    } else {
      // stepping out: current shrinks to become the peek, outer doll grows in from beyond frame
      const outer = appearanceFor(seed, depth - 1);
      drawDoll(ctx, cx, cy, scale * (1.7 - e * 0.7), outer, e);
      drawDoll(ctx, cx, cy + scale * 0.14 * e, scale * (1 - e * 0.7), cur, 1 - e * 0.6);
    }
  }

  function animateTo(direction, done) {
    animating = true;
    window.__matDirection = direction;
    hintEl.style.display = "none";
    const start = performance.now();
    const DURATION = 480;
    function frame(now) {
      const t = Math.min(1, (now - start) / DURATION);
      render(t);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        animating = false;
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  function openDoll() {
    if (animating) return;
    animateTo("in", () => {
      depth += 1;
      syncUrl();
      updateChrome();
      render(1);
    });
  }

  function stepOut() {
    if (animating || depth === 0) return;
    animateTo("out", () => {
      depth -= 1;
      syncUrl();
      updateChrome();
      render(1);
    });
  }

  // ---------- interaction ----------

  stage.addEventListener("click", openDoll);

  outBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    stepOut();
  });

  function setAuto(on) {
    autoBtn.classList.toggle("active", on);
    autoBtn.textContent = on ? "■ stop" : "▶ auto-descend";
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    if (on) {
      autoTimer = setInterval(() => {
        if (!animating) openDoll();
      }, 900);
    }
  }
  autoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setAuto(!autoBtn.classList.contains("active"));
  });

  rerollBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setAuto(false);
    seed = randomSeed();
    depth = 0;
    syncUrl();
    updateChrome();
    render(1);
  });

  seedInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") seedInput.blur();
  });
  seedInput.addEventListener("change", () => {
    const v = seedInput.value.replace(/[^a-z0-9]/gi, "").slice(0, 10);
    if (!v) {
      seedInput.value = seed;
      return;
    }
    setAuto(false);
    seed = v;
    depth = 0;
    syncUrl();
    updateChrome();
    render(1);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (document.activeElement === seedInput) return;
      e.preventDefault();
      openDoll();
    } else if (e.key === "Backspace" || e.key === "Escape") {
      e.preventDefault();
      stepOut();
    }
  });

  // ---------- share card (canvas -> download / native share) ----------

  function buildShareCard() {
    const W = 1200,
      H = 630;
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const octx = off.getContext("2d");
    octx.fillStyle = "#201014";
    octx.fillRect(0, 0, W, H);

    const cur = appearanceFor(seed, depth);
    const next = appearanceFor(seed, depth + 1);
    const afterNext = appearanceFor(seed, depth + 2);
    drawDoll(octx, 330, 340, 620, cur, 1);
    drawDoll(octx, 330, 420, 190, next, 0.85);
    drawDoll(octx, 330, 450, 60, afterNext, 0.7);

    octx.fillStyle = "#ffb143";
    octx.font = "700 54px monospace";
    octx.fillText("matryoshka", 700, 220);
    octx.fillStyle = "#b98a7a";
    octx.font = "24px monospace";
    octx.fillText("doll #" + depth + " — still not out of dolls", 700, 265);
    octx.fillText("open it and there's a smaller one inside.", 700, 300);
    octx.fillStyle = "#ffb143";
    octx.font = "700 26px monospace";
    octx.fillText("matryoshka.bisks.net", 700, 560);

    return off;
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  cardBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const off = buildShareCard();
    off.toBlob(async (blob) => {
      if (!blob) return;
      const shareText =
        "doll #" + depth + " deep into my own matryoshka. " + location.href;
      if (canShareFiles()) {
        try {
          const file = new File([blob], "matryoshka.png", { type: "image/png" });
          await navigator.share({ files: [file], text: shareText, title: "matryoshka" });
          return;
        } catch (err) {
          /* fall through to download */
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "matryoshka-doll-" + depth + ".png";
      a.click();
    }, "image/png");
  });

  // ---------- boot ----------

  resize();
  syncUrl();
  updateChrome();
})();

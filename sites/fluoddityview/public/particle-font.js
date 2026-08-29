// particle-font.js — a "moving font": glyphs sampled from real text, each
// sample point turned into a colored fluoddity particle. Particles obey the
// same colored attraction-matrix physics as the background simulation
// (app.js), leashed to their glyph point with a spring so the swarm still
// traces the letterforms -- but per @words.bsky.social's 2026-08-29 ask
// ("make the entire plaque look like that. don't worry about the
// readability.") the leash is deliberately loose now: every text block on
// the plaque runs through this, not just the title, and the physics prizes
// motion over legibility. Two entry points: createParticleText({lines: [...]})
// for short fixed strings (title, quotes), and createParticleText({text,
// wrap: true}) for paragraphs, which auto-wraps and autofits a font size to
// the canvas box before sampling.
(function () {
  const COLORS = ["#ff5c8a", "#ffd166", "#4ecdc4", "#8c7bff", "#38bdf8", "#9dffb0"];

  function randomRules() {
    const c = COLORS.length;
    const m = [];
    for (let i = 0; i < c; i++) {
      const row = [];
      for (let j = 0; j < c; j++) row.push(Math.random() * 2 - 1);
      m.push(row);
    }
    return m;
  }

  function wrapLine(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (cur && ctx.measureText(test).width > maxWidth) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  // Shrinks font size until the wrapped paragraph fits the box, so long
  // copy (the lede, the explainer note) still lands inside its canvas.
  function fitAndWrap(ctx, text, fontFamily, weight, boxW, boxH, maxFontPx, minFontPx) {
    let fontPx = maxFontPx;
    let lines, lineHeight;
    while (fontPx >= minFontPx) {
      ctx.font = `${weight} ${fontPx}px ${fontFamily}`;
      lines = wrapLine(ctx, text, boxW);
      lineHeight = fontPx * 1.28;
      if (lines.length * lineHeight <= boxH) break;
      fontPx -= 1;
    }
    return { fontPx, lines, lineHeight };
  }

  function sampleGlyphs(lines, font, lineHeight, step, maxParticles) {
    const off = document.createElement("canvas");
    const octx = off.getContext("2d");
    octx.font = font;
    const width = Math.max(1, Math.ceil(Math.max(...lines.map((l) => octx.measureText(l).width))));
    off.width = width;
    off.height = Math.ceil(lineHeight * lines.length);
    octx.font = font;
    octx.fillStyle = "#fff";
    octx.textBaseline = "alphabetic";
    octx.textAlign = "center";
    const fontSize = parseInt(/(\d+)px/.exec(font)[1], 10);
    lines.forEach((line, i) => {
      octx.fillText(line, width / 2, lineHeight * i + fontSize * 0.86);
    });
    const img = octx.getImageData(0, 0, width, off.height);
    let points = [];
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (img.data[(y * width + x) * 4 + 3] > 128) points.push({ x, y });
      }
    }
    if (points.length > maxParticles) {
      const stride = Math.ceil(points.length / maxParticles);
      points = points.filter((_, i) => i % stride === 0);
    }
    return { points, width, height: off.height };
  }

  function createParticleText(canvas, opts) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [];
    let rules = randomRules();
    let W, H;

    // Loose by default: the swarm still leans toward the letterform but
    // wanders a lot further from it and settles a lot less. Pass tighter
    // numbers per-instance if a block really needs to stay legible.
    const RMAX = opts.rmax || 18;
    const BETA = opts.beta || 0.3;
    const LEASH_K = opts.leashK != null ? opts.leashK : 0.045;
    const LEASH_MAX = opts.leashMax != null ? opts.leashMax : 24;
    const FRICTION = opts.friction || 0.88;
    const FORCE_SCALE = opts.forceScale != null ? opts.forceScale : 0.42;
    const JITTER = opts.jitter != null ? opts.jitter : 0.14;
    const STEP = opts.step || 4;
    const MAX_PARTICLES = opts.maxParticles || 1400; // browser-memory/frame-time guard, not a legibility limit

    function layout() {
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      W = canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      H = canvas.height = Math.max(1, Math.round(cssHeight * dpr));

      const fontFamily = opts.fontFamily || "Georgia, serif";
      const weight = opts.fontWeight || 700;
      let lines, lineHeight;

      if (opts.wrap) {
        const measure = document.createElement("canvas").getContext("2d");
        const pad = 0.96;
        const fit = fitAndWrap(
          measure,
          opts.text,
          fontFamily,
          weight,
          W * pad,
          H * pad,
          opts.maxFontPx || Math.floor(H / 2),
          opts.minFontPx || 8
        );
        lines = fit.lines;
        lineHeight = fit.lineHeight;
      } else {
        lines = opts.lines;
        lineHeight = H / lines.length;
      }
      const fontPx = opts.wrap
        ? Math.max(8, Math.floor(lineHeight / 1.28))
        : Math.max(10, Math.floor(lineHeight * 0.72));
      const font = `${weight} ${fontPx}px ${fontFamily}`;
      const { points, width, height } = sampleGlyphs(lines, font, lineHeight, STEP, MAX_PARTICLES);

      const scale = Math.min(W / width, H / height);
      const offsetX = (W - width * scale) / 2;
      const offsetY = (H - height * scale) / 2;

      const targets = points.map((p) => ({
        x: p.x * scale + offsetX,
        y: p.y * scale + offsetY,
      }));

      while (particles.length < targets.length) {
        particles.push({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          c: Math.floor(Math.random() * COLORS.length),
          phase: Math.random() * Math.PI * 2,
          seeded: false,
        });
      }
      particles.length = targets.length;
      particles.forEach((p, i) => {
        p.tx = targets[i].x;
        p.ty = targets[i].y;
        if (!p.seeded) {
          p.x = p.tx + (Math.random() - 0.5) * 60;
          p.y = p.ty + (Math.random() - 0.5) * 60;
          p.seeded = true;
        }
      });
    }

    let t = 0;
    function step() {
      t += 1;
      const n = particles.length;
      const cell = RMAX;
      const rows = Math.max(1, Math.ceil(H / cell));
      const buckets = new Map();
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        const key = ((p.x / cell) | 0) * rows + ((p.y / cell) | 0);
        let arr = buckets.get(key);
        if (!arr) buckets.set(key, (arr = []));
        arr.push(i);
      }
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        const cx = (p.x / cell) | 0;
        const cy = (p.y / cell) | 0;
        let fx = 0,
          fy = 0;
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const arr = buckets.get((cx + ox) * rows + (cy + oy));
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const j = arr[k];
              if (j === i) continue;
              const q = particles[j];
              const dx = q.x - p.x,
                dy = q.y - p.y;
              const r = Math.sqrt(dx * dx + dy * dy);
              if (r <= 0 || r > RMAX) continue;
              const rn = r / RMAX;
              let f;
              if (rn < BETA) f = rn / BETA - 1;
              else f = rules[p.c][q.c] * (1 - Math.abs(2 * rn - 1 - BETA) / (1 - BETA));
              fx += (dx / r) * f;
              fy += (dy / r) * f;
            }
          }
        }
        fx += (p.tx - p.x) * LEASH_K;
        fy += (p.ty - p.y) * LEASH_K;
        fx += Math.sin(t * 0.05 + p.phase) * JITTER;
        fy += Math.cos(t * 0.04 + p.phase * 1.3) * JITTER;

        p.vx = (p.vx + fx * FORCE_SCALE) * FRICTION;
        p.vy = (p.vy + fy * FORCE_SCALE) * FRICTION;
      }
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        const dx = p.x - p.tx,
          dy = p.y - p.ty;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > LEASH_MAX) {
          const k = LEASH_MAX / d;
          p.x = p.tx + dx * k;
          p.y = p.ty + dy * k;
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const size = Math.max(1.2, 1.9 * dpr);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.fillStyle = COLORS[p.c];
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
    }

    let running = true;
    function loop() {
      if (running) {
        step();
        draw();
      }
      requestAnimationFrame(loop);
    }

    layout();
    loop();

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 150);
    });
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
    });

    return {
      mutate() {
        const c = COLORS.length;
        for (let i = 0; i < c; i++)
          for (let j = 0; j < c; j++)
            rules[i][j] = Math.max(-1, Math.min(1, rules[i][j] + (Math.random() * 2 - 1) * 0.35));
      },
      reroll() {
        rules = randomRules();
      },
    };
  }

  window.createParticleText = createParticleText;

  // createParticleFrame — same attraction-matrix + leash physics as
  // createParticleText, but the "letterform" is a rectangle outline instead
  // of glyph pixels, and the palette is amber/gold rather than the full
  // rainbow. Added 2026-08-29 per @words.bsky.social: the plaque's own
  // frame, and every "bix" (box) on it, should be made of the same material
  // it's honoring -- fluoddity particles -- not a static CSS border.
  const AMBER = ["#e8c88a", "#ffe9b8", "#c99a4a", "#f0d18a"];

  function frameRectPoints(W, H, inset, step) {
    const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset;
    const points = [];
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return points;
    for (let x = x0; x < x1; x += step) points.push({ x, y: y0 });
    for (let y = y0; y < y1; y += step) points.push({ x: x1, y });
    for (let x = x1; x > x0; x -= step) points.push({ x, y: y1 });
    for (let y = y1; y > y0; y -= step) points.push({ x: x0, y });
    return points;
  }

  function createParticleFrame(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const palette = opts.colors || AMBER;
    let particles = [];
    let rules;
    let W, H;

    const RMAX = opts.rmax || 14;
    const BETA = opts.beta || 0.32;
    const LEASH_K = opts.leashK != null ? opts.leashK : 0.09;
    const LEASH_MAX = opts.leashMax != null ? opts.leashMax : 7;
    const FRICTION = opts.friction || 0.86;
    const FORCE_SCALE = opts.forceScale != null ? opts.forceScale : 0.4;
    const JITTER = opts.jitter != null ? opts.jitter : 0.1;
    const STEP = opts.step || 6; // px between border sample points
    const INSET = opts.inset != null ? opts.inset : 3;

    function paletteRules() {
      const c = palette.length;
      const m = [];
      for (let i = 0; i < c; i++) {
        const row = [];
        for (let j = 0; j < c; j++) row.push(Math.random() * 2 - 1);
        m.push(row);
      }
      return m;
    }
    rules = paletteRules();

    function layout() {
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      W = canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      H = canvas.height = Math.max(1, Math.round(cssHeight * dpr));

      const targets = frameRectPoints(W, H, INSET * dpr, STEP * dpr);

      while (particles.length < targets.length) {
        particles.push({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          c: Math.floor(Math.random() * palette.length),
          phase: Math.random() * Math.PI * 2,
          seeded: false,
        });
      }
      particles.length = targets.length;
      particles.forEach((p, i) => {
        p.tx = targets[i].x;
        p.ty = targets[i].y;
        if (!p.seeded) {
          p.x = p.tx + (Math.random() - 0.5) * 20;
          p.y = p.ty + (Math.random() - 0.5) * 20;
          p.seeded = true;
        }
      });
    }

    let t = 0;
    function step() {
      t += 1;
      const n = particles.length;
      const cell = RMAX;
      const rows = Math.max(1, Math.ceil(H / cell));
      const buckets = new Map();
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        const key = ((p.x / cell) | 0) * rows + ((p.y / cell) | 0);
        let arr = buckets.get(key);
        if (!arr) buckets.set(key, (arr = []));
        arr.push(i);
      }
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        const cx = (p.x / cell) | 0;
        const cy = (p.y / cell) | 0;
        let fx = 0,
          fy = 0;
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const arr = buckets.get((cx + ox) * rows + (cy + oy));
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const j = arr[k];
              if (j === i) continue;
              const q = particles[j];
              const dx = q.x - p.x,
                dy = q.y - p.y;
              const r = Math.sqrt(dx * dx + dy * dy);
              if (r <= 0 || r > RMAX) continue;
              const rn = r / RMAX;
              let f;
              if (rn < BETA) f = rn / BETA - 1;
              else f = rules[p.c][q.c] * (1 - Math.abs(2 * rn - 1 - BETA) / (1 - BETA));
              fx += (dx / r) * f;
              fy += (dy / r) * f;
            }
          }
        }
        fx += (p.tx - p.x) * LEASH_K;
        fy += (p.ty - p.y) * LEASH_K;
        fx += Math.sin(t * 0.05 + p.phase) * JITTER;
        fy += Math.cos(t * 0.04 + p.phase * 1.3) * JITTER;

        p.vx = (p.vx + fx * FORCE_SCALE) * FRICTION;
        p.vy = (p.vy + fy * FORCE_SCALE) * FRICTION;
      }
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        const dx = p.x - p.tx,
          dy = p.y - p.ty;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > LEASH_MAX) {
          const k = LEASH_MAX / d;
          p.x = p.tx + dx * k;
          p.y = p.ty + dy * k;
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const size = Math.max(1, 1.6 * dpr);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.fillStyle = palette[p.c];
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
    }

    let running = true;
    function loop() {
      if (running) {
        step();
        draw();
      }
      requestAnimationFrame(loop);
    }

    layout();
    loop();

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 150);
    });
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
    });

    return {
      mutate() {
        const c = palette.length;
        for (let i = 0; i < c; i++)
          for (let j = 0; j < c; j++)
            rules[i][j] = Math.max(-1, Math.min(1, rules[i][j] + (Math.random() * 2 - 1) * 0.35));
      },
      reroll() {
        rules = paletteRules();
      },
    };
  }

  window.createParticleFrame = createParticleFrame;
})();

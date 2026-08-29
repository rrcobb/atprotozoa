// particle-font.js — a "moving font": glyphs sampled from real text, each
// sample point turned into a colored fluoddity particle. Particles obey the
// same colored attraction-matrix physics as the background simulation
// (app.js), but every particle is leashed to its glyph point with a spring
// and a hard-clamped radius, so the letterforms always hold their shape --
// no still pixels (every particle drifts/orbits continuously) and always
// readable (the leash caps how far any particle can stray).
(function () {
  const COLORS = ["#ff5c8a", "#ffd166", "#4ecdc4", "#8c7bff", "#38bdf8", "#9dffb0"];
  const RMAX = 16;
  const BETA = 0.3;
  const LEASH_K = 0.09;
  const LEASH_MAX = 7;
  const FRICTION = 0.86;
  const FORCE_SCALE = 0.35;
  const JITTER = 0.05;
  const STEP = 4; // glyph sample spacing, in offscreen raster px
  const MAX_PARTICLES = 2400; // browser-memory/frame-time guard, not a legibility limit

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

  function sampleGlyphs(lines, font, lineHeight) {
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
    for (let y = 0; y < off.height; y += STEP) {
      for (let x = 0; x < width; x += STEP) {
        if (img.data[(y * width + x) * 4 + 3] > 128) points.push({ x, y });
      }
    }
    if (points.length > MAX_PARTICLES) {
      const stride = Math.ceil(points.length / MAX_PARTICLES);
      points = points.filter((_, i) => i % stride === 0);
    }
    return { points, width, height: off.height };
  }

  function createParticleText(canvas, opts) {
    const ctx = canvas.getContext("2d");
    const lines = opts.lines;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [];
    let rules = randomRules();
    let W, H;

    function layout() {
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      W = canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      H = canvas.height = Math.max(1, Math.round(cssHeight * dpr));

      const lineHeight = H / lines.length;
      const fontPx = Math.max(10, Math.floor(lineHeight * 0.72));
      const font = `700 ${fontPx}px ${opts.fontFamily || "Georgia, serif"}`;
      const { points, width, height } = sampleGlyphs(lines, font, lineHeight);

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
      const size = Math.max(1.3, 2.0 * dpr);
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
})();

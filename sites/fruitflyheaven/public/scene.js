// Canvas rendering for fruitflyheaven: the garden (fly, fruit, particles) and
// the connectome diagram (fixed anatomical layout, activation-driven glow).
// Pure drawing — no simulation logic, that's brain.js/world.js. Depends on
// FlyWorld/FlyBrain being loaded first for their constants.

const FlyScene = (() => {
  function clear(ctx, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- garden ----------

  function drawGarden(ctx, world, w, h) {
    const sx = w / FlyWorld.ARENA_W;
    const sy = h / FlyWorld.ARENA_H;

    clear(ctx, w, h, "#0c1408");
    const g = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.7);
    g.addColorStop(0, "rgba(120,200,90,0.10)");
    g.addColorStop(1, "rgba(12,20,8,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(sx, sy);

    for (const f of world.fruits) {
      const age = Math.max(0, Math.min(1, (world.time - f.bornAt) / 0.5));
      const r = 9 * age;
      ctx.save();
      ctx.globalAlpha = age;
      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2.6);
      glow.addColorStop(0, f.flavor.glow);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.flavor.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of world.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawFly(ctx, world.fly);

    ctx.restore();
  }

  function drawFly(ctx, fly) {
    ctx.save();
    ctx.translate(fly.x, fly.y);
    ctx.rotate(fly.heading);

    const flap = Math.sin(fly.wingPhase) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#dfe9ff";
    ctx.beginPath();
    ctx.ellipse(-1, -5 - flap * 2, 7, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-1, 5 + flap * 2, 7, 3, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#241a08";
    ctx.beginPath();
    ctx.ellipse(-3, 0, 6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.arc(4, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- connectome diagram ----------
  // Fixed anatomical layout matching brain.js's real wiring order. Node glow
  // = activation, drawn fresh each frame from world.lastActivations.

  const LAYOUT = { w: 800, h: 360 };

  function ring(cx, cy, r, n, startAngle) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (startAngle || 0) + (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  }

  function row(cx, cy, gap, n) {
    const pts = [];
    const total = (n - 1) * gap;
    for (let i = 0; i < n; i++) pts.push({ x: cx - total / 2 + i * gap, y: cy });
    return pts;
  }

  function grid(cx, cy, cols, gap, n) {
    const pts = [];
    const rows = Math.ceil(n / cols);
    const totalW = (cols - 1) * gap;
    const totalH = (rows - 1) * gap;
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const r = Math.floor(i / cols);
      pts.push({ x: cx - totalW / 2 + col * gap, y: cy - totalH / 2 + r * gap });
    }
    return pts;
  }

  function buildLayout() {
    const retina = ring(130, 85, 55, FlyBrain.RETINA_N, -Math.PI / 2);
    const lcFood = row(300, 55, 20, FlyBrain.LC_N);
    const lcWall = row(300, 115, 20, FlyBrain.LC_N);
    const odor = row(130, 200, 26, FlyBrain.ODOR_N);
    const kc = grid(430, 85, 5, 22, FlyBrain.KC_N);
    const mbon = row(560, 200, 40, 2);
    const lh = row(300, 200, 40, 2);
    const eb = ring(680, 85, 42, FlyBrain.EB_N);
    const fb = ring(680, 200, 42, FlyBrain.FB_N);
    const dn = row(680, 300, 60, 2);
    return { retina, lcFood, lcWall, odor, kc, mbon, lh, eb, fb, dn };
  }

  const layout = buildLayout();

  const EDGES = [
    ["retina", "lcFood"],
    ["retina", "lcWall"],
    ["lcFood", "kc"],
    ["lcWall", "kc"],
    ["odor", "kc"],
    ["kc", "mbon"],
    ["lcFood", "lh"],
    ["lcWall", "lh"],
    ["odor", "lh"],
    ["mbon", "fb"],
    ["lh", "fb"],
    ["eb", "fb"],
    ["fb", "dn"],
  ];

  function centroid(pts) {
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    return { x, y };
  }

  function drawConnectome(ctx, activations, w, h, learningStrength) {
    const sx = w / LAYOUT.w;
    const sy = h / LAYOUT.h;
    clear(ctx, w, h, "#0a0c14");
    ctx.save();
    ctx.scale(sx, sy);

    ctx.strokeStyle = "rgba(140,160,220,0.14)";
    ctx.lineWidth = 1;
    for (const [a, b] of EDGES) {
      const ca = centroid(layout[a]);
      const cb = centroid(layout[b]);
      ctx.beginPath();
      ctx.moveTo(ca.x, ca.y);
      ctx.lineTo(cb.x, cb.y);
      ctx.stroke();
    }

    if (!activations) {
      ctx.restore();
      return;
    }

    const groups = [
      { pts: layout.retina, vals: activations.retinaFood, color: "#8fd3ff" },
      { pts: layout.lcFood, vals: activations.lcFood, color: "#8fd3ff" },
      { pts: layout.lcWall, vals: activations.lcWall, color: "#ff9d7a" },
      { pts: layout.odor, vals: activations.odor, color: "#ffd166" },
      { pts: layout.kc, vals: activations.kc, color: "#c792ea" },
      { pts: layout.mbon, vals: activations.mbon, color: "#9ef01a" },
      { pts: layout.lh, vals: activations.lh, color: "#ff6b6b" },
      { pts: layout.eb, vals: activations.eb, color: "#4cc9f0" },
      { pts: layout.fb, vals: activations.fb, color: "#f72585" },
      { pts: layout.dn, vals: activations.dn, color: "#ffffff" },
    ];

    for (const grp of groups) {
      for (let i = 0; i < grp.pts.length; i++) {
        const p = grp.pts[i];
        const v = Math.max(0, Math.min(1, grp.vals[i] || 0));
        const r = 4 + v * 7;
        if (v > 0.04) {
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
          glow.addColorStop(0, grp.color);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = Math.min(1, 0.35 + v * 0.65);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = grp.color;
        ctx.globalAlpha = 0.5 + v * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    ctx.fillStyle = "rgba(200,210,255,0.55)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("retina", layout.retina[0].x, 18);
    ctx.fillText("odor", layout.odor[0].x - 10, 232);
    ctx.fillText("LC", 300, 30);
    ctx.fillText("KC (mushroom body)", 430, 15);
    ctx.fillText("MBON", 560, 232);
    ctx.fillText("LH", 300, 232);
    ctx.fillText("EB", 680, 25);
    ctx.fillText("FB", 680, 260);
    ctx.fillText("wing motor", 680, 335);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(158,240,26,0.8)";
    ctx.fillText(`learned weight: ${learningStrength.toFixed(2)}`, 14, 350);

    ctx.restore();
  }

  return { LAYOUT, drawGarden, drawConnectome };
})();

if (typeof module !== "undefined") module.exports = FlyScene;

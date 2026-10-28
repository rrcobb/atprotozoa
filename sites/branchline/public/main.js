(() => {
  const cv = document.getElementById("c");
  const ctx = cv.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const hint = $("hint");
  let pts = [];
  let dpr = 1;
  let t0 = performance.now();

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
  }
  window.addEventListener("resize", resize);
  resize();

  function addPoint(e) {
    const r = cv.getBoundingClientRect();
    pts.push({ x: e.clientX - r.left, y: e.clientY - r.top, born: performance.now() });
    hint.hidden = true;
  }
  cv.addEventListener("pointerdown", addPoint);
  $("undo").addEventListener("click", () => { pts.pop(); hint.hidden = pts.length > 0; });
  $("clear").addEventListener("click", () => { pts = []; hint.hidden = false; });
  $("save").addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = "branchline.png";
    a.href = cv.toDataURL("image/png");
    a.click();
  });
  $("share").href = "https://bsky.app/intent/compose?text=" +
    encodeURIComponent("I grew a fractal tree from a line of clicks https://branchline.bisks.net/");

  // deterministic per-branch pseudo-random so trees don't flicker between frames
  function rnd(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  function leaf(x, y, ang, size, hue) {
    ctx.fillStyle = `hsl(${hue} 60% 55%)`;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.45, ang, 0, Math.PI * 2);
    ctx.fill();
  }

  function branch(x, y, ang, len, d, maxD, o, seed, grow) {
    if (grow <= 0) return;
    const g = Math.min(1, grow);
    const sway = Math.sin(o.time * 1.3 + seed) * o.wind * 0.012 * (maxD - d + 1);
    const a = ang + sway;
    const x2 = x + Math.cos(a) * len * g;
    const y2 = y + Math.sin(a) * len * g;
    const w = Math.max(0.6, (d + 1) * 0.9);
    ctx.strokeStyle = `hsl(${28 + (maxD - d) * 4} ${40 + (maxD - d) * 3}% ${22 + (maxD - d) * 3}%)`;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    if (d === 0) {
      if (g >= 1) leaf(x2, y2, a, 4 + rnd(seed) * 3, 90 + rnd(seed + 1) * 60);
      return;
    }
    if (g < 1) return;
    const sp = o.spread * (0.8 + rnd(seed + 2) * 0.4);
    const nl = len * o.shrink * (0.9 + rnd(seed + 3) * 0.2);
    const cg = grow - 1;
    branch(x2, y2, a - sp, nl, d - 1, maxD, o, seed * 2 + 1, cg);
    branch(x2, y2, a + sp, nl, d - 1, maxD, o, seed * 2 + 2, cg);
  }

  function frame(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const o = {
      spread: (+$("spread").value * Math.PI) / 180,
      shrink: +$("shrink").value / 100,
      wind: +$("wind").value,
      time: (now - t0) / 1000,
    };
    const depth = +$("depth").value;
    // the polyline itself
    if (pts.length > 1) {
      ctx.strokeStyle = "#5a4630";
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    pts.forEach((p, i) => {
      const age = (now - p.born) / 350; // growth speed: one generation per 350ms
      // each segment grows a tree from its point, heading along the line
      // toward the next point (the last point grows straight up)
      const nx = pts[i + 1];
      const base = nx ? Math.atan2(nx.y - p.y, nx.x - p.x) : -Math.PI / 2;
      const segLen = nx ? Math.hypot(nx.x - p.x, nx.y - p.y) : 70;
      // side branches off the line, up and down, so the line itself sprouts
      const len0 = Math.max(18, Math.min(segLen * 0.45, 120));
      const seed = i * 977 + 13;
      branch(p.x, p.y, nx ? base - Math.PI / 2 : base, len0, depth, depth, o, seed, age);
      if (nx) branch(p.x, p.y, base + Math.PI / 2, len0 * 0.6, Math.max(1, depth - 2), Math.max(1, depth - 2), o, seed + 5000, age);
      ctx.fillStyle = "#e8d9a8";
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

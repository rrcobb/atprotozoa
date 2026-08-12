// Draws a permanent, ever-growing honeycomb. Pure canvas 2D, no deps.
// Cells fill outward in a hex spiral, one per correct answer, and never empty
// back out — the hive is a running record of the colony's whole life.
// Layout math (hexRing/axialToPixel/hexPath) mirrors sites/mathhive/public/hive.js.

const Hive = (() => {
  const DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];

  function hexRing(radius) {
    if (radius === 0) return [{ q: 0, r: 0 }];
    const out = [];
    let hex = { q: DIRS[4].q * radius, r: DIRS[4].r * radius };
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < radius; step++) {
        out.push({ q: hex.q, r: hex.r });
        hex = { q: hex.q + DIRS[side].q, r: hex.r + DIRS[side].r };
      }
    }
    return out;
  }

  function spiralCells(count) {
    // count >= 1: center cell first, then ring 1, ring 2, ... in spiral order.
    const out = [{ q: 0, r: 0 }];
    let ring = 1;
    while (out.length < count) {
      out.push(...hexRing(ring));
      ring++;
    }
    return out.slice(0, count);
  }

  function axialToPixel(q, r, size) {
    return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
  }

  function hexPath(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  class HiveScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cellSize = 30;
      this.filledCount = 0;
      this.cellPositions = []; // pixel positions for every laid-out cell, index 0 = queen/first
      this.bees = []; // { x, y, wobbleSeed, speed, angle } idle wanderers
      this.flightBee = null; // active grow animation
      this._raf = null;
      this._resize();
      window.addEventListener("resize", () => this._resize());
      this._ensureLoop();
    }

    _resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, rect.width * this.dpr);
      this.canvas.height = Math.max(1, rect.height * this.dpr);
      this._layout();
    }

    _layout() {
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;
      // Lay out enough cells for what's filled plus a little headroom for the
      // "next" ghost cell and future growth so the view doesn't jump around.
      const need = Math.max(this.filledCount + 1, 7);
      const cells = spiralCells(need);
      const pixels = cells.map((c) => axialToPixel(c.q, c.r, this.cellSize));
      const xs = pixels.map((p) => p.x), ys = pixels.map((p) => p.y);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const offX = w / 2 - midX, offY = h / 2 - midY;
      this.cellPositions = pixels.map((p) => ({ x: p.x + offX, y: p.y + offY }));
      this._reseedBees();
    }

    _reseedBees() {
      const n = Math.min(1 + Math.floor(this.filledCount / 6), 10);
      while (this.bees.length < n) {
        const c = this.cellPositions[Math.floor(Math.random() * Math.max(1, this.filledCount))] || this.cellPositions[0];
        this.bees.push({
          x: c.x, y: c.y,
          angle: Math.random() * Math.PI * 2,
          wobbleSeed: Math.random() * 1000,
          speed: 0.4 + Math.random() * 0.5,
        });
      }
      this.bees.length = n;
    }

    // Set the hive straight to N filled cells with no animation (page load).
    setFilled(n) {
      this.filledCount = Math.max(0, n);
      this._layout();
      this._draw();
    }

    // Animate growth from filledCount to filledCount+1, then resolve.
    growOne(onLand) {
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;
      const target = this.cellPositions[this.filledCount] || { x: w / 2, y: h / 2 };
      const from = { x: w / 2, y: h + 18 };
      this.flightBee = {
        x0: from.x, y0: from.y, x1: target.x, y1: target.y,
        start: performance.now(), duration: 620, done: false,
      };
      this._ensureLoop();
      const check = () => {
        const t = (performance.now() - this.flightBee.start) / this.flightBee.duration;
        if (t >= 1) {
          this.flightBee = null;
          this.filledCount++;
          this._layout();
          onLand && onLand();
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }

    _ensureLoop() {
      if (this._raf) return;
      const loop = () => {
        this._draw();
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    _draw() {
      const ctx = this.ctx;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;
      ctx.clearRect(0, 0, w, h);

      // cells: filled ones solid honey, the very next one a dashed "growing" outline
      this.cellPositions.forEach((p, i) => {
        const filled = i < this.filledCount;
        const isNext = i === this.filledCount;
        const isQueen = i === 0;
        hexPath(ctx, p.x, p.y, this.cellSize - 3);
        if (filled) {
          ctx.fillStyle = isQueen ? "#ffb703" : "#f4a300";
          ctx.fill();
          ctx.lineWidth = isQueen ? 2.5 : 1.5;
          ctx.strokeStyle = isQueen ? "#ffe08a" : "#6b5322";
          ctx.stroke();
        } else if (isNext) {
          ctx.fillStyle = "rgba(244,163,0,0.08)";
          ctx.fill();
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#f4a300";
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(107,83,34,0.35)";
          ctx.stroke();
        }
      });

      // idle bees, wandering near the built hive
      const now = performance.now();
      const centerCount = Math.max(1, this.filledCount);
      for (const bee of this.bees) {
        const home = this.cellPositions[Math.floor((bee.wobbleSeed * 997) % centerCount)] || this.cellPositions[0];
        bee.angle += 0.01 * bee.speed;
        const orbit = this.cellSize * 1.4;
        bee.x = home.x + Math.cos(bee.angle + bee.wobbleSeed) * orbit;
        bee.y = home.y + Math.sin(bee.angle * 1.3 + bee.wobbleSeed) * orbit * 0.6;
        ctx.save();
        ctx.translate(bee.x, bee.y);
        ctx.font = "13px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐝", 0, 0);
        ctx.restore();
      }

      // flight bee (growing a new cell)
      if (this.flightBee) {
        const b = this.flightBee;
        const t = Math.min(1, (now - b.start) / b.duration);
        const e = easeInOutCubic(t);
        const arc = Math.sin(t * Math.PI) * -30;
        const x = b.x0 + (b.x1 - b.x0) * e;
        const y = b.y0 + (b.y1 - b.y0) * e + arc;
        ctx.save();
        ctx.translate(x, y);
        ctx.font = "22px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐝", 0, 0);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  return { HiveScene, spiralCells };
})();

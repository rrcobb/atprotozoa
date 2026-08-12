// Draws the hive and flies bees between cells. Pure canvas 2D, no deps.
// Layout: a hex spiral around a center "queen cell" reserved for the final
// answer; intermediate steps fill the ring cells in spiral order.

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

  function axialToPixel(q, r, size) {
    return {
      x: size * Math.sqrt(3) * (q + r / 2),
      y: size * 1.5 * r,
    };
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

  // Build cell layout for N steps: N-1 ring cells (spiral order) + 1 center
  // queen cell for the final step. N === 1 is just the queen cell alone.
  function layout(stepCount, size) {
    const cells = [];
    if (stepCount <= 1) {
      cells.push({ q: 0, r: 0 });
    } else {
      const need = stepCount - 1;
      let radius = 1;
      while (3 * radius * (radius + 1) < need) radius++;
      const spiral = [];
      for (let ring = 1; ring <= radius; ring++) spiral.push(...hexRing(ring));
      cells.push(...spiral.slice(0, need));
      cells.push({ q: 0, r: 0 }); // queen cell last
    }
    const pixels = cells.map((c) => axialToPixel(c.q, c.r, size));
    const xs = pixels.map((p) => p.x);
    const ys = pixels.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { cells, pixels, bounds: { minX, maxX, minY, maxY } };
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  class HiveScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cellSize = 46;
      this.cells = []; // { x, y, filled, text, isQueen }
      this.bees = []; // active flight animations
      this.flower = { x: 0, y: 0 };
      this._raf = null;
      this._resize();
      window.addEventListener("resize", () => this._resize());
    }

    _resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, rect.width * this.dpr);
      this.canvas.height = Math.max(1, rect.height * this.dpr);
      this._draw();
    }

    setSteps(stepCount) {
      const { pixels, bounds } = layout(stepCount, this.cellSize);
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;
      const midX = (bounds.minX + bounds.maxX) / 2;
      const midY = (bounds.minY + bounds.maxY) / 2;
      const offX = w / 2 - midX;
      const offY = h / 2 - midY + 18;
      this.cells = pixels.map((p, i) => ({
        x: p.x + offX,
        y: p.y + offY,
        filled: false,
        text: "",
        isQueen: i === pixels.length - 1,
      }));
      this.flower = { x: 34, y: h - 34 };
      this.bees = [];
      this._draw();
    }

    // Fly a bee from the previous cell (or the flower, for the first step) to
    // cell[index], landing after durationMs, then mark it filled with label.
    flyTo(index, label, durationMs, onLand) {
      const target = this.cells[index];
      const from = index === 0 ? this.flower : this.cells[index - 1];
      const bee = {
        x0: from.x,
        y0: from.y,
        x1: target.x,
        y1: target.y,
        start: performance.now(),
        duration: durationMs,
        wobbleSeed: Math.random() * 1000,
        done: false,
      };
      this.bees.push(bee);
      this._ensureLoop();
      const check = () => {
        const t = (performance.now() - bee.start) / bee.duration;
        if (t >= 1) {
          bee.done = true;
          target.filled = true;
          target.text = label;
          this.bees = this.bees.filter((b) => b !== bee);
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
        if (this.bees.length > 0) {
          this._raf = requestAnimationFrame(loop);
        } else {
          this._raf = null;
        }
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

      // cells
      for (const cell of this.cells) {
        hexPath(ctx, cell.x, cell.y, this.cellSize - 4);
        ctx.fillStyle = cell.isQueen ? (cell.filled ? "#ffb703" : "#3a2c0f") : cell.filled ? "#f4a300" : "#241a08";
        ctx.fill();
        ctx.lineWidth = cell.isQueen ? 3 : 1.5;
        ctx.strokeStyle = cell.isQueen ? "#ffe08a" : "#6b5322";
        ctx.stroke();
        if (cell.filled && cell.text) {
          ctx.fillStyle = cell.isQueen ? "#241a08" : "#241a08";
          ctx.font = (cell.isQueen ? "bold 15px" : "12px") + " ui-monospace, 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          wrapText(ctx, cell.text, cell.x, cell.y, this.cellSize * 1.7, 13);
        }
      }

      // flower
      ctx.font = "22px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🌼", this.flower.x, this.flower.y);

      // bees
      const now = performance.now();
      for (const bee of this.bees) {
        const t = Math.min(1, (now - bee.start) / bee.duration);
        const e = easeInOutCubic(t);
        const arc = Math.sin(t * Math.PI) * -26;
        const x = bee.x0 + (bee.x1 - bee.x0) * e;
        const y = bee.y0 + (bee.y1 - bee.y0) * e + arc;
        const wobble = Math.sin(now / 40 + bee.wobbleSeed) * 2;
        ctx.save();
        ctx.translate(x, y + wobble);
        ctx.font = "20px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐝", 0, 0);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  function wrapText(ctx, text, cx, cy, maxWidth, lineHeight) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const startY = cy - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
  }

  return { HiveScene };
})();

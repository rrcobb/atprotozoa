// important-art — a small particle-life simulation as the tribute itself,
// not a screenshot of one. Colored particles push and pull each other under
// a random attraction matrix (rules[colorA][colorB]); "mutate" perturbs that
// matrix in place, "reroll" draws a fresh one — the mutation / artificial
// selection fluoddity.com itself is about, at a scale a 2D canvas can hold.
(function () {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const COLORS = ["#ff5c8a", "#ffd166", "#4ecdc4", "#8c7bff", "#38bdf8", "#9dffb0"];
  const N = 900;
  const RMAX = 62;
  const BETA = 0.28; // inner-repulsion cutoff, as a fraction of RMAX
  const FRICTION = 0.82;
  const FORCE_SCALE = 0.55;

  let W, H, cellSize, cols, rows;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pvx = new Float32Array(N);
  const pvy = new Float32Array(N);
  const pc = new Uint8Array(N);
  let rules = randomRules();

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

  function mutateRules() {
    const c = COLORS.length;
    for (let i = 0; i < c; i++) {
      for (let j = 0; j < c; j++) {
        rules[i][j] = Math.max(-1, Math.min(1, rules[i][j] + (Math.random() * 2 - 1) * 0.35));
      }
    }
  }

  function scatter() {
    for (let i = 0; i < N; i++) {
      px[i] = Math.random() * W;
      py[i] = Math.random() * H;
      pvx[i] = 0;
      pvy[i] = 0;
      pc[i] = Math.floor(Math.random() * COLORS.length);
    }
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cellSize = RMAX;
    cols = Math.max(1, Math.ceil(W / cellSize));
    rows = Math.max(1, Math.ceil(H / cellSize));
  }
  window.addEventListener("resize", resize);
  resize();
  scatter();

  function step() {
    const buckets = new Map();
    for (let i = 0; i < N; i++) {
      const key = ((px[i] / cellSize) | 0) * rows + ((py[i] / cellSize) | 0);
      let arr = buckets.get(key);
      if (!arr) buckets.set(key, (arr = []));
      arr.push(i);
    }
    for (let i = 0; i < N; i++) {
      const cx = (px[i] / cellSize) | 0;
      const cy = (py[i] / cellSize) | 0;
      let fx = 0, fy = 0;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = buckets.get((cx + ox) * rows + (cy + oy));
          if (!arr) continue;
          for (let n = 0; n < arr.length; n++) {
            const j = arr[n];
            if (j === i) continue;
            const dx = px[j] - px[i];
            const dy = py[j] - py[i];
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r <= 0 || r > RMAX) continue;
            const rn = r / RMAX;
            let f;
            if (rn < BETA) {
              f = rn / BETA - 1;
            } else {
              f = (rules[pc[i]][pc[j]] * (1 - Math.abs(2 * rn - 1 - BETA) / (1 - BETA)));
            }
            fx += (dx / r) * f;
            fy += (dy / r) * f;
          }
        }
      }
      pvx[i] = (pvx[i] + fx * FORCE_SCALE) * FRICTION;
      pvy[i] = (pvy[i] + fy * FORCE_SCALE) * FRICTION;
    }
    for (let i = 0; i < N; i++) {
      px[i] += pvx[i];
      py[i] += pvy[i];
      if (px[i] < 0) px[i] += W;
      if (px[i] >= W) px[i] -= W;
      if (py[i] < 0) py[i] += H;
      if (py[i] >= H) py[i] -= H;
    }
  }

  function draw() {
    ctx.fillStyle = "rgba(5,4,10,0.22)";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = COLORS[pc[i]];
      ctx.fillRect(px[i], py[i], 2.6, 2.6);
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
  requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
  });

  // shieldPulse: a defensive reflex, not a security feature -- there's no
  // real vandalism vector on a static plaque (only the bot can edit this
  // source), but @bitfuktangel.bsky.social asked the plaque be "capable of
  // defending itself" and the honest version of that, on a particle-life
  // piece, is the swarm itself reacting. A burst of outward impulse from
  // the plaque's center, falling off with distance, so the field visibly
  // flinches away from the center and then the normal rules pull it back
  // into shape on their own -- no new persistent state, just one impulse.
  function shieldPulse() {
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.max(W, H) * 0.55;
    for (let i = 0; i < N; i++) {
      const dx = px[i] - cx;
      const dy = py[i] - cy;
      const r = Math.sqrt(dx * dx + dy * dy) || 1;
      const falloff = Math.max(0, 1 - r / maxR);
      const kick = falloff * 9;
      pvx[i] += (dx / r) * kick;
      pvy[i] += (dy / r) * kick;
    }
  }

  window.importantArt = {
    mutate: mutateRules,
    reroll() {
      rules = randomRules();
      scatter();
    },
    shieldPulse,
  };
})();

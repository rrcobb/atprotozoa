// main.js — particle-life simulation inside a circular dish.
//
// Classic "particle life" / "Clusters": each of N species gets a row in a
// random asymmetric attraction matrix (species A can be pulled toward B while
// B is pushed away from A — that asymmetry is what produces chasing/orbiting
// instead of everything just clumping). Force-per-pair uses the standard
// piecewise curve (hardcore repulsion at very close range, matrix-driven
// attraction/repulsion out to a cutoff, nothing beyond it) — see force()
// below. Neighbor lookups go through a uniform grid keyed by cutoff radius so
// the per-frame cost stays close to O(n) instead of O(n^2).
//
// Everything here is seeded (mulberry32, same recipe as sites/didsigil and
// sites/murmuration) so a seed in the URL reproduces the exact same species
// count, matrix, and starting layout — the same colony grows again, even
// though where it ends up a few seconds later is never pixel-identical.

const canvas = document.getElementById("sim");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const seedLabel = document.getElementById("seedLabel");
const els = {
  randomizeBtn: document.getElementById("randomizeBtn"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  species: document.getElementById("speciesSlider"),
  count: document.getElementById("countSlider"),
  force: document.getElementById("forceSlider"),
  friction: document.getElementById("frictionSlider"),
  reach: document.getElementById("reachSlider"),
};

// A genuine main-thread cap, not a data cap: the grid-accelerated neighbor
// pass still does real work per particle, and canvas2d draws each one as a
// separate arc. 1200 stays smooth on an ordinary laptop; the slider is
// clamped to that on purpose.
const MAX_PARTICLES = 1200;
const BETA = 0.3; // hardcore-repulsion radius as a fraction of the cutoff

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToCode(seed) {
  return (seed >>> 0).toString(36);
}
function codeToSeed(code) {
  const n = parseInt(code, 36);
  return Number.isFinite(n) ? n >>> 0 : null;
}

let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
let dishCx = 0, dishCy = 0, dishR = 0;
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dishCx = W / 2;
  dishCy = H / 2 + 10;
  dishR = Math.min(W, H) * 0.44;
}
window.addEventListener("resize", resize);
resize();

const params = { force: 1, friction: 0.12, reach: 70 };
els.force.addEventListener("input", () => (params.force = parseFloat(els.force.value)));
els.friction.addEventListener("input", () => (params.friction = parseFloat(els.friction.value)));
els.reach.addEventListener("input", () => (params.reach = parseFloat(els.reach.value)));

const HUES = [352, 28, 200, 145, 268, 48, 320];

let species = 5;
let particles = [];
let matrix = [];
let currentSeed = 0;

function buildColony(seed, nSpecies, nParticles) {
  const rng = mulberry32(seed);
  const m = [];
  for (let i = 0; i < nSpecies; i++) {
    const row = [];
    for (let j = 0; j < nSpecies; j++) row.push(rng() * 2 - 1);
    m.push(row);
  }
  const list = [];
  for (let i = 0; i < nParticles; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * dishR * 0.85;
    list.push({
      x: dishCx + Math.cos(ang) * rad,
      y: dishCy + Math.sin(ang) * rad,
      vx: 0, vy: 0,
      type: Math.floor(rng() * nSpecies),
    });
  }
  return { matrix: m, particles: list };
}

function loadColony(seed, nSpecies, nParticles) {
  currentSeed = seed >>> 0;
  species = nSpecies;
  const built = buildColony(currentSeed, nSpecies, nParticles);
  matrix = built.matrix;
  particles = built.particles;
  seedLabel.textContent = `seed ${seedToCode(currentSeed)} · ${nSpecies} species · ${nParticles} particles`;
  updateShare();
}

function force(r, a) {
  if (r < BETA) return r / BETA - 1;
  if (r < 1) return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA));
  return 0;
}

function buildGrid(cell) {
  const cols = Math.max(1, Math.ceil(W / cell));
  const rows = Math.max(1, Math.ceil(H / cell));
  const grid = new Map();
  for (let idx = 0; idx < particles.length; idx++) {
    const p = particles[idx];
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(p.x / cell)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(p.y / cell)));
    const key = cy * cols + cx;
    let arr = grid.get(key);
    if (!arr) { arr = []; grid.set(key, arr); }
    arr.push(idx);
  }
  return { grid, cols, rows };
}

function step(dt) {
  const reach = params.reach;
  const { grid, cols, rows } = buildGrid(reach);
  const n = particles.length;
  const fscale = params.force * 6;

  for (let i = 0; i < n; i++) {
    const p = particles[i];
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(p.x / reach)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(p.y / reach)));
    let ax = 0, ay = 0;
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      if (gy < 0 || gy >= rows) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= cols) continue;
        const bucket = grid.get(gy * cols + gx);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i) continue;
          const o = particles[j];
          const dx = o.x - p.x, dy = o.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d === 0 || d > reach) continue;
          const f = force(d / reach, matrix[p.type][o.type]) * fscale;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        }
      }
    }
    p.vx = (p.vx + ax * dt) * (1 - params.friction);
    p.vy = (p.vy + ay * dt) * (1 - params.friction);
  }

  for (let i = 0; i < n; i++) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const dx = p.x - dishCx, dy = p.y - dishCy;
    const d = Math.hypot(dx, dy);
    if (d > dishR) {
      const nx = dx / d, ny = dy / d;
      p.x = dishCx + nx * dishR;
      p.y = dishCy + ny * dishR;
      const vn = p.vx * nx + p.vy * ny;
      p.vx -= 2 * vn * nx;
      p.vy -= 2 * vn * ny;
      p.vx *= 0.6; p.vy *= 0.6;
    }
  }
}

function colorFor(type, alpha) {
  const hue = HUES[type % HUES.length];
  return `hsla(${hue}, 68%, 46%, ${alpha})`;
}

function drawDish() {
  ctx.save();
  ctx.beginPath();
  ctx.arc(dishCx, dishCy, dishR, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(dishCx, dishCy, dishR * 0.1, dishCx, dishCy, dishR);
  grad.addColorStop(0, "#fdfbf3");
  grad.addColorStop(1, "#eee6cf");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(120,110,80,0.35)";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(dishCx, dishCy, dishR - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawDish();
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = colorFor(p.type, 0.85);
    ctx.fill();
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(1.6, (now - last) / 16.7);
  last = now;
  step(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- controls ---------------------------------------------------------------

function currentCount() {
  return Math.min(MAX_PARTICLES, parseInt(els.count.value, 10));
}

function reseed(seed) {
  const n = parseInt(els.species.value, 10);
  const c = currentCount();
  loadColony(seed, n, c);
  statusEl.textContent = "";
}

els.randomizeBtn.addEventListener("click", () => {
  reseed((Math.random() * 0xffffffff) >>> 0);
});
els.species.addEventListener("change", () => reseed(currentSeed ^ (Math.random() * 0xffffffff) >>> 0));
els.count.addEventListener("change", () => reseed(currentSeed));

// --- sharing ----------------------------------------------------------------

function shareUrl() {
  return `https://petridish.bisks.net/?seed=${seedToCode(currentSeed)}&s=${species}&n=${particles.length}`;
}
function shareText() {
  return `a petri dish of ${particles.length} particles across ${species} species, colonizing themselves: ${shareUrl()}`;
}
function updateShare() {
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
}

function buildShareCanvas() {
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const sctx = c.getContext("2d");
  sctx.fillStyle = "#e9e3d3";
  sctx.fillRect(0, 0, 1200, 630);
  const cx = 600, cy = 300, r = 260;
  const grad = sctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  grad.addColorStop(0, "#fdfbf3");
  grad.addColorStop(1, "#eee6cf");
  sctx.beginPath();
  sctx.arc(cx, cy, r, 0, Math.PI * 2);
  sctx.fillStyle = grad;
  sctx.fill();
  sctx.lineWidth = 6;
  sctx.strokeStyle = "rgba(120,110,80,0.35)";
  sctx.stroke();

  const sx = r / dishR, sy = r / dishR;
  for (const p of particles) {
    const px = cx + (p.x - dishCx) * sx;
    const py = cy + (p.y - dishCy) * sy;
    sctx.beginPath();
    sctx.arc(px, py, 2.4, 0, Math.PI * 2);
    sctx.fillStyle = colorFor(p.type, 0.9);
    sctx.fill();
  }

  sctx.fillStyle = "rgba(42,38,32,0.9)";
  sctx.fillRect(0, 552, 1200, 78);
  sctx.fillStyle = "#fdf6e8";
  sctx.font = "700 30px ui-monospace, monospace";
  sctx.textAlign = "left";
  sctx.fillText("petridish.bisks.net", 40, 598);
  sctx.font = "20px ui-monospace, monospace";
  sctx.fillStyle = "#f0c896";
  sctx.textAlign = "right";
  sctx.fillText(`seed ${seedToCode(currentSeed)} · ${species} species`, 1160, 598);
  return c;
}

els.shareDownload.addEventListener("click", () => {
  const c = buildShareCanvas();
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "petridish-" + seedToCode(currentSeed) + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    const c = buildShareCanvas();
    c.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "petridish.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText(), title: "petri dish" });
      } catch {
        // cancelled or unsupported mid-flight — no-op
      }
    }, "image/png");
  });
}

// ?seed=<code>&s=<species>&n=<count> reproduces the same colony, same
// convention as sites/didsigil / sites/murmuration's shared-link handling.
const qp = new URLSearchParams(location.search);
const sharedSeed = qp.get("seed");
const sharedSpecies = parseInt(qp.get("s"), 10);
const sharedCount = parseInt(qp.get("n"), 10);
if (sharedSeed && codeToSeed(sharedSeed) !== null) {
  const n = Number.isFinite(sharedSpecies) && sharedSpecies >= 2 && sharedSpecies <= 7 ? sharedSpecies : 5;
  const c = Number.isFinite(sharedCount) && sharedCount >= 50 ? Math.min(MAX_PARTICLES, sharedCount) : 600;
  els.species.value = String(n);
  els.count.value = String(Math.min(1200, c));
  loadColony(codeToSeed(sharedSeed), n, c);
} else {
  loadColony((Math.random() * 0xffffffff) >>> 0, species, currentCount());
}

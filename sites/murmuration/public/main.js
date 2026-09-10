// main.js — boids flocking sim + optional Bluesky-follows flock.
//
// Classic boids: separation, alignment, cohesion, computed pairwise each
// frame. O(n^2), which is why the bird count is capped (see MAX_BIRDS below
// — a genuine main-thread/framerate cap, not a data cap: when a loaded
// follow list is bigger than the cap, every follow is still counted and
// shown in the status line, just not all rendered as birds).
import { resolveDid, getProfile, getProfiles, fetchFollows } from "./lib/identity.js";

const canvas = document.getElementById("sim");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const statusEl = document.getElementById("status");
const els = {
  form: document.getElementById("flockForm"),
  handle: document.getElementById("handle"),
  flockBtn: document.getElementById("flockBtn"),
  resetBtn: document.getElementById("resetBtn"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  sep: document.getElementById("sepSlider"),
  ali: document.getElementById("aliSlider"),
  coh: document.getElementById("cohSlider"),
  speed: document.getElementById("speedSlider"),
};

const MAX_BIRDS = 260; // smooth 60fps for the O(n^2) neighbor pass on an ordinary laptop
const PERCEPTION = 70;
const SEP_RADIUS = 26;
const MOUSE_RADIUS = 130;
const MOUSE_FORCE = 0.35;

let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const params = { sep: 1.4, ali: 1.0, coh: 1.0, maxSpeed: 3.4 };
els.sep.addEventListener("input", () => (params.sep = parseFloat(els.sep.value)));
els.ali.addEventListener("input", () => (params.ali = parseFloat(els.ali.value)));
els.coh.addEventListener("input", () => (params.coh = parseFloat(els.coh.value)));
els.speed.addEventListener("input", () => (params.maxSpeed = parseFloat(els.speed.value)));

// Small deterministic string hash (djb2 variant) + mulberry32 PRNG, so the
// same DID always seeds the same color and the same sampled subset of
// follows — same "your identity always redraws the same thing" idea as
// sites/didsigil, applied to a flock instead of a kaleidoscope.
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mkBird(x, y, hue, opts) {
  const ang = Math.random() * Math.PI * 2;
  return {
    x, y,
    vx: Math.cos(ang) * 1.5,
    vy: Math.sin(ang) * 1.5,
    hue,
    did: (opts && opts.did) || null,
    handle: (opts && opts.handle) || null,
    isLeader: !!(opts && opts.isLeader),
  };
}

function randomFlock(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(mkBird(Math.random() * W, Math.random() * H, null, null));
  return out;
}

let birds = randomFlock(180);
let flockLabel = null; // { handle, count, total } once a Bluesky flock is loaded

const mouse = { x: -9999, y: -9999, active: false };
canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  hoverCheck(e.clientX, e.clientY);
});
canvas.addEventListener("mouseleave", () => { mouse.active = false; tooltip.style.display = "none"; });
canvas.addEventListener("touchmove", (e) => {
  if (!e.touches.length) return;
  const t = e.touches[0];
  mouse.x = t.clientX; mouse.y = t.clientY; mouse.active = true;
}, { passive: true });
canvas.addEventListener("touchend", () => { mouse.active = false; });

function hoverCheck(px, py) {
  let nearest = null, nearestD = 18 * 18;
  for (const b of birds) {
    if (!b.handle) continue;
    const dx = b.x - px, dy = b.y - py;
    const d = dx * dx + dy * dy;
    if (d < nearestD) { nearestD = d; nearest = b; }
  }
  if (nearest) {
    tooltip.textContent = (nearest.isLeader ? "★ " : "") + "@" + nearest.handle;
    tooltip.style.left = px + 14 + "px";
    tooltip.style.top = py + 10 + "px";
    tooltip.style.display = "block";
  } else {
    tooltip.style.display = "none";
  }
}

function wrap(v, max) {
  if (v < -20) return max + 20;
  if (v > max + 20) return -20;
  return v;
}

function step() {
  const n = birds.length;
  for (let i = 0; i < n; i++) {
    const b = birds[i];
    let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0, count = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const o = birds[j];
      const dx = o.x - b.x, dy = o.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > PERCEPTION * PERCEPTION || d2 === 0) continue;
      const d = Math.sqrt(d2);
      if (d < SEP_RADIUS) { sepX -= dx / d; sepY -= dy / d; }
      aliX += o.vx; aliY += o.vy;
      cohX += o.x; cohY += o.y;
      count++;
    }
    let ax = sepX * params.sep;
    let ay = sepY * params.sep;
    if (count > 0) {
      ax += (aliX / count) * 0.05 * params.ali;
      ay += (aliY / count) * 0.05 * params.ali;
      ax += (cohX / count - b.x) * 0.001 * params.coh;
      ay += (cohY / count - b.y) * 0.001 * params.coh;
    }
    if (mouse.active) {
      const dx = b.x - mouse.x, dy = b.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < MOUSE_RADIUS * MOUSE_RADIUS && d2 > 0) {
        const d = Math.sqrt(d2);
        const f = (1 - d / MOUSE_RADIUS) * MOUSE_FORCE;
        ax += (dx / d) * f * 10;
        ay += (dy / d) * f * 10;
      }
    }
    b.vx += ax; b.vy += ay;
    const speed = Math.hypot(b.vx, b.vy) || 0.0001;
    const maxS = b.isLeader ? params.maxSpeed * 1.1 : params.maxSpeed;
    const minS = maxS * 0.4;
    const clamped = Math.max(minS, Math.min(maxS, speed));
    b.vx = (b.vx / speed) * clamped;
    b.vy = (b.vy / speed) * clamped;
    b.x += b.vx; b.y += b.vy;
    b.x = wrap(b.x, W);
    b.y = wrap(b.y, H);
  }
}

function birdColor(b) {
  if (b.hue == null) return b.isLeader ? "#fff2d6" : "rgba(20,12,10,0.88)";
  return `hsl(${b.hue}, 72%, ${b.isLeader ? 72 : 56}%)`;
}

function render() {
  ctx.clearRect(0, 0, W, H);
  for (const b of birds) {
    const ang = Math.atan2(b.vy, b.vx);
    const len = b.isLeader ? 11 : 7;
    const wid = b.isLeader ? 4.5 : 3;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(-len * 0.6, wid);
    ctx.lineTo(-len * 0.3, 0);
    ctx.lineTo(-len * 0.6, -wid);
    ctx.closePath();
    ctx.fillStyle = birdColor(b);
    ctx.fill();
    if (b.isLeader) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(32, now - last);
  last = now;
  step();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Bluesky flock loading -------------------------------------------------

function setStatus(msg, isErr) {
  statusEl.textContent = msg || "";
  statusEl.className = isErr ? "err" : "";
}

async function loadFlock(actor) {
  els.flockBtn.disabled = true;
  try {
    setStatus("resolving " + actor + "...");
    const did = await resolveDid(actor);
    const [leaderProfile, follows] = await Promise.all([
      getProfile(did),
      fetchFollows(did, (msg) => setStatus(typeof msg === "string" ? msg : msg + " follows so far...")),
    ]);
    if (!follows.length) {
      setStatus("@" + leaderProfile.handle + " doesn't follow anyone (yet).", true);
      return;
    }
    setStatus(`fetching ${Math.min(follows.length, MAX_BIRDS - 1)} profiles...`);
    const rng = mulberry32(hashStr(did));
    // Deterministic sample down to the render cap: shuffle with the seeded
    // RNG (Fisher-Yates) rather than slicing the raw list, so which follows
    // get shown isn't just "whoever they followed first."
    const pool = follows.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const sample = pool.slice(0, MAX_BIRDS - 1);
    const profiles = await getProfiles(sample);

    const newBirds = [mkBird(W / 2, H / 2, hashStr(did) % 360, { did, handle: leaderProfile.handle, isLeader: true })];
    for (const fdid of sample) {
      const p = profiles.get(fdid);
      const hue = hashStr(fdid) % 360;
      newBirds.push(
        mkBird(Math.random() * W, Math.random() * H, hue, { did: fdid, handle: p ? p.handle : null }),
      );
    }
    birds = newBirds;
    flockLabel = { handle: leaderProfile.handle, count: sample.length, total: follows.length };
    const shownNote = follows.length > sample.length
      ? ` (showing ${sample.length} of ${follows.length} — capped for framerate, sampled deterministically)`
      : "";
    setStatus(`@${leaderProfile.handle}'s flock: ${sample.length} follows${shownNote}`);
    updateShare();
  } catch (err) {
    setStatus("couldn't load that flock: " + err.message, true);
  } finally {
    els.flockBtn.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = els.handle.value.trim();
  if (v) loadFlock(v);
});

els.resetBtn.addEventListener("click", () => {
  birds = randomFlock(180);
  flockLabel = null;
  setStatus("");
  updateShare();
});

// --- sharing ----------------------------------------------------------------

const SKY_STOPS = [
  [0, "#1a1030"], [0.22, "#3a1f4d"], [0.45, "#7a3b5e"],
  [0.65, "#c85a4a"], [0.82, "#e8935a"], [1, "#f5c168"],
];

function shareText() {
  if (flockLabel) {
    return `@${flockLabel.handle}'s murmuration -- ${flockLabel.count} of their follows, flocking live: https://murmuration.bisks.net/?h=${encodeURIComponent(flockLabel.handle)}`;
  }
  return `a murmuration of ${birds.length} birds, swirling away from my cursor: https://murmuration.bisks.net/`;
}

function updateShare() {
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
}
updateShare();

function buildShareCanvas() {
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const sctx = c.getContext("2d");
  const grad = sctx.createLinearGradient(0, 0, 0, 630);
  for (const [stop, color] of SKY_STOPS) grad.addColorStop(stop, color);
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 1200, 630);

  const sx = 1200 / W, sy = 500 / H;
  for (const b of birds) {
    const bx = b.x * sx, by = 40 + b.y * sy;
    const ang = Math.atan2(b.vy, b.vx);
    const len = (b.isLeader ? 15 : 9) * Math.min(sx, sy) * 2.4;
    const wid = (b.isLeader ? 6 : 4) * Math.min(sx, sy) * 2.4;
    sctx.save();
    sctx.translate(bx, by);
    sctx.rotate(ang);
    sctx.beginPath();
    sctx.moveTo(len, 0);
    sctx.lineTo(-len * 0.6, wid);
    sctx.lineTo(-len * 0.3, 0);
    sctx.lineTo(-len * 0.6, -wid);
    sctx.closePath();
    sctx.fillStyle = birdColor(b);
    sctx.fill();
    sctx.restore();
  }

  sctx.fillStyle = "rgba(10,4,20,0.72)";
  sctx.fillRect(0, 552, 1200, 78);
  sctx.fillStyle = "#f3ead8";
  sctx.font = "700 30px ui-monospace, monospace";
  sctx.textAlign = "left";
  sctx.fillText("murmuration.bisks.net", 40, 598);
  sctx.font = "20px ui-monospace, monospace";
  sctx.fillStyle = "#ffd8a8";
  const label = flockLabel
    ? `@${flockLabel.handle}'s flock — ${flockLabel.count} follows`
    : `${birds.length} birds, no reason at all`;
  sctx.textAlign = "right";
  sctx.fillText(label, 1160, 598);
  return c;
}

els.shareDownload.addEventListener("click", () => {
  const c = buildShareCanvas();
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "murmuration-" + (flockLabel ? flockLabel.handle : "flock") + ".png";
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
      const file = new File([blob], "murmuration.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText(), title: "murmuration" });
      } catch {
        // cancelled or unsupported mid-flight — no-op
      }
    }, "image/png");
  });
}

// ?h=<handle> auto-loads that person's flock, same convention as
// sites/didscope's shared-link handling.
const sharedHandle = new URLSearchParams(location.search).get("h");
if (sharedHandle) {
  els.handle.value = sharedHandle;
  loadFlock(sharedHandle);
}

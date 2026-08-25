// mootgrinder — @cee.wtf's idea: load your moots' pfps, drag one into a
// coffee grinder, and it gets ground into a real falling-sand pile where
// every grain is one pixel of that pfp. Pure client-side canvas cellular
// automaton (see lib/sand.js) + the public AppView for the moot graph (see
// lib/moots.js) — no login, no server state.

import { moots } from "./lib/moots.js";
import { SandSim } from "./lib/sand.js";

const BIN_COLS = 150;
const BIN_ROWS = 104;
const BIN_BG = [5, 8, 10, 255];
const SITE_URL = "https://mootgrinder.bisks.net/";

const els = {
  form: document.getElementById("form"),
  handle: document.getElementById("handle"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  app: document.getElementById("app"),
  tray: document.getElementById("tray"),
  trayLabel: document.getElementById("trayLabel"),
  grinderBox: document.getElementById("grinderBox"),
  hopper: document.getElementById("hopper"),
  hopperFill: document.getElementById("hopperFill"),
  grind: document.getElementById("grind"),
  bin: document.getElementById("bin"),
  reset: document.getElementById("reset"),
  download: document.getElementById("download"),
  shareBluesky: document.getElementById("shareBluesky"),
  stats: document.getElementById("stats"),
  toast: document.getElementById("toast"),
  shareCanvas: document.getElementById("shareCanvas"),
};

const binCtx = els.bin.getContext("2d", { willReadFrequently: false });
const imageData = binCtx.createImageData(BIN_COLS, BIN_ROWS);
const sim = new SandSim(BIN_COLS, BIN_ROWS);

let feedQueue = [];
let groundCount = 0;
let lastHandle = "";

// ---- toast ---------------------------------------------------------------

let toastTimer = null;
function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

// ---- moot loading ----------------------------------------------------------

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run(els.handle.value);
});

async function run(actor) {
  const v = (actor || "").trim();
  if (!v) {
    els.handle.focus();
    return;
  }
  els.go.disabled = true;
  els.status.className = "status";
  els.status.textContent = "resolving…";
  try {
    const result = await moots(v, { onStep: (s) => (els.status.textContent = s) });
    lastHandle = v;
    renderTray(result);
    els.status.className = "status ok";
    els.status.textContent = `loaded ${result.counts.mutuals} mutual${result.counts.mutuals === 1 ? "" : "s"} (of ${result.counts.follows} followed, ${result.counts.followers} followers).`;
    els.app.classList.remove("hidden");
    history.replaceState(null, "", "?handle=" + encodeURIComponent(v));
  } catch (err) {
    els.status.className = "status err";
    els.status.textContent = err && err.message ? `couldn't load that — ${err.message}` : "couldn't load that handle — check spelling.";
  } finally {
    els.go.disabled = false;
  }
}

function renderTray(result) {
  els.trayLabel.textContent = `${result.pool.length} ${result.kind}`;
  els.tray.innerHTML = "";
  for (const p of result.pool) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.title = `@${p.handle} — drag into the hopper`;
    const img = document.createElement("img");
    img.src = p.avatar || "";
    img.alt = p.displayName;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    chip.appendChild(img);
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = "@" + p.handle;
    chip.appendChild(name);
    wireDrag(chip, p);
    els.tray.appendChild(chip);
  }
}

// ---- drag a chip into the hopper (pointer events: mouse + touch) --------

function wireDrag(chip, avatar) {
  let dragging = false;
  let clone = null;
  let startX = 0, startY = 0;

  chip.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    chip.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!dragging && dx * dx + dy * dy > 36) {
        dragging = true;
        chip.classList.add("dragging");
        clone = chip.cloneNode(true);
        clone.className = "chip dragging-clone";
        document.body.appendChild(clone);
      }
      if (dragging && clone) {
        clone.style.left = ev.clientX - 29 + "px";
        clone.style.top = ev.clientY - 29 + "px";
        els.hopper.classList.toggle("hover", overHopper(ev.clientX, ev.clientY));
      }
    };

    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      chip.classList.remove("dragging");
      els.hopper.classList.remove("hover");
      if (clone) {
        clone.remove();
        clone = null;
      }
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      const dist2 = dx * dx + dy * dy;
      if (overHopper(ev.clientX, ev.clientY)) {
        grind(avatar);
      } else if (!dragging || dist2 < 625) {
        // a tap, or an imprecise touch that barely moved (25px) without
        // landing on the hopper — treat it as a tap too, mobile-friendly.
        grind(avatar);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  });
}

function overHopper(x, y) {
  const r = els.hopper.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// ---- sampling a pfp down to grains ---------------------------------------

function loadImg(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// cdn.bsky.app sends no CORS header, so a crossOrigin="anonymous" load of
// the avatar directly would just fail — route it through this site's own
// /img proxy (src/index.ts), which re-serves the same bytes with an open
// CORS header so the sampling canvas below doesn't get tainted.
function proxied(url) {
  if (!url) return url;
  return "/img?u=" + encodeURIComponent(url);
}

async function sampleAvatar(url, S) {
  const img = await loadImg(proxied(url));
  if (!img) return null;
  try {
    const off = document.createElement("canvas");
    off.width = S;
    off.height = S;
    const octx = off.getContext("2d", { willReadFrequently: true });
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const side = Math.min(iw, ih);
    octx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, S, S);
    const data = octx.getImageData(0, 0, S, S).data;
    const cx = (S - 1) / 2, cy = (S - 1) / 2, rad2 = (S / 2) * (S / 2);
    const grains = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > rad2) continue; // clip to a circle, like a pfp
        const i = (y * S + x) * 4;
        if (data[i + 3] < 20) continue;
        grains.push({ sx: x, sy: y, r: data[i], g: data[i + 1], b: data[i + 2] });
      }
    }
    grains.sort((a, b) => a.sy - b.sy);
    return grains;
  } catch {
    return null; // tainted canvas (CORS) or decode failure
  }
}

// deterministic fallback so a grind always produces *something* even if the
// avatar can't be pixel-read (host without CORS, broken image, no avatar set).
function fallbackGrains(avatar, S) {
  let h = 0;
  const key = avatar.handle || avatar.did || "moot";
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const r = 90 + (h & 0x3f), g = 60 + ((h >> 6) & 0x3f), b = 140 + ((h >> 12) & 0x3f);
  const cx = (S - 1) / 2, cy = (S - 1) / 2, rad2 = (S / 2) * (S / 2);
  const grains = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > rad2) continue;
      grains.push({ sx: x, sy: y, r, g, b });
    }
  }
  return grains;
}

// ---- grinding: image grains -> the falling-sand feed queue ---------------

async function grind(avatar) {
  showToast(`grinding @${avatar.handle}…`);
  const level = Number(els.grind.value) || 2;
  const S = level === 1 ? 34 : level === 2 ? 22 : 14;
  const block = level;

  let grains = await sampleAvatar(avatar.avatar, S);
  if (!grains || !grains.length) grains = fallbackGrains(avatar, S);

  const spoutWidth = Math.min(BIN_COLS - 6, S * block);
  const spoutStart = Math.floor((BIN_COLS - spoutWidth) / 2);

  for (const gr of grains) {
    feedQueue.push({
      x: spoutStart + gr.sx * block,
      block,
      r: gr.r,
      g: gr.g,
      b: gr.b,
    });
  }
  groundCount++;
}

function processFeed() {
  if (!feedQueue.length) return;
  const n = Math.min(feedQueue.length, Math.max(6, Math.ceil(feedQueue.length / 40)));
  for (let i = 0; i < n; i++) {
    const it = feedQueue.shift();
    for (let by = 0; by < it.block; by++) {
      for (let bx = 0; bx < it.block; bx++) {
        sim.place(it.x + bx, by, it.r, it.g, it.b);
      }
    }
  }
}

// ---- plowing the pile ------------------------------------------------------
// Dragging across the bin should feel like shoving a finger through actual
// sand: fast drags carve a wide trench and throw grains ahead of the motion,
// slow ones nudge a small patch. So every pointermove measures how far the
// pointer moved (in grid cells) since the last event and drives that much
// real displacement — see SandSim.push — rather than a fixed, direction-less
// jitter.

let stirring = false;
let lastGrid = null;

els.bin.addEventListener("pointerdown", (e) => {
  stirring = true;
  els.bin.setPointerCapture(e.pointerId);
  const g = toGrid(e);
  lastGrid = g;
  sim.push(g.x, g.y, 5, 0, -1, 2); // a bare click still digs a little dimple
});
els.bin.addEventListener("pointermove", (e) => {
  if (!stirring) return;
  const g = toGrid(e);
  plowTo(g);
  lastGrid = g;
});
window.addEventListener("pointerup", () => {
  stirring = false;
  lastGrid = null;
});

function toGrid(e) {
  const r = els.bin.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * BIN_COLS,
    y: ((e.clientY - r.top) / r.height) * BIN_ROWS,
  };
}

function plowTo(g) {
  if (!lastGrid) return;
  const dx = g.x - lastGrid.x, dy = g.y - lastGrid.y;
  const speed = Math.sqrt(dx * dx + dy * dy);
  if (speed < 0.05) return;
  const dirx = dx / speed, diry = dy / speed;
  // faster drags dig a wider, deeper trench, up to a cap so a wild swipe
  // doesn't vaporize the whole pile in one frame.
  const radius = Math.min(13, 4.5 + speed * 0.7);
  const dist = Math.min(10, Math.max(2, Math.round(speed * 1.3)));
  // sample the segment from the last point to this one so a fast move (which
  // can jump several grid cells between pointermove events) still plows a
  // continuous line instead of stamping isolated blobs.
  const steps = Math.max(1, Math.ceil(speed / (radius * 0.6)));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    sim.push(lastGrid.x + dx * t, lastGrid.y + dy * t, radius, dirx, diry, dist);
  }
}

// ---- reset / download / share --------------------------------------------

els.reset.addEventListener("click", () => {
  sim.clear();
  feedQueue = [];
  groundCount = 0;
});

function shareText() {
  const who = lastHandle ? `@${lastHandle}'s` : "my";
  return `ground up ${who} moots' pfps into sand on mootgrinder — every grain is a pixel. ${SITE_URL}`;
}

function refreshShareLink() {
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
}

function buildShareImage() {
  const ctx = els.shareCanvas.getContext("2d");
  ctx.fillStyle = "#130d0a";
  ctx.fillRect(0, 0, 1200, 630);
  const scale = Math.min(1000 / BIN_COLS, 430 / BIN_ROWS);
  const w = BIN_COLS * scale, h = BIN_ROWS * scale;
  const x = (1200 - w) / 2, y = 130;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(els.bin, x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#e0a458";
  ctx.font = "bold 54px monospace";
  ctx.fillText("mootgrinder", 60, 78);
  ctx.fillStyle = "#a99785";
  ctx.font = "22px monospace";
  ctx.fillText(`${sim.count} grains ground, one pixel at a time`, 60, 116);
  ctx.fillStyle = "#7d6c5c";
  ctx.font = "20px monospace";
  ctx.fillText("mootgrinder.bisks.net", 60, y + h + 42);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

els.download.addEventListener("click", () => {
  buildShareImage();
  els.shareCanvas.toBlob(async (blob) => {
    if (!blob) return;
    if (canShareFiles()) {
      try {
        const file = new File([blob], "mootgrinder.png", { type: "image/png" });
        await navigator.share({ files: [file], text: shareText(), title: "mootgrinder" });
        return;
      } catch {
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mootgrinder.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});

// ---- render loop -----------------------------------------------------------

function tick() {
  sim.step();
  processFeed();
  sim.render(imageData, BIN_BG);
  binCtx.putImageData(imageData, 0, 0);

  els.grinderBox.classList.toggle("grinding", feedQueue.length > 0);
  els.hopperFill.style.height = Math.min(100, feedQueue.length / 6) + "%";
  els.stats.innerHTML = `bin: <b>${sim.count}</b> grains &middot; <b>${groundCount}</b> moot${groundCount === 1 ? "" : "s"} ground`;
  refreshShareLink();

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- boot: prefill from ?handle= ------------------------------------------

const initial = new URLSearchParams(location.search).get("handle") || "";
if (initial) {
  els.handle.value = initial;
  run(initial);
}
refreshShareLink();

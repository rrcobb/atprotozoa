// glitch.js — mootvent's gift-wrapping. Two things live here:
//   1. a deterministic seeded RNG, so "door 7's art" or "door 7's door-order"
//      looks the same every time you reopen it, without storing pixels;
//   2. drawGlitchArt (procedural gift, no photo needed) and drawGlitchPhoto
//      (a real photo run through the same treatment), both painting onto a
//      caller-supplied canvas so the door modal and the share-card canvas
//      can reuse the exact same gift.
//
// The photo channel-shift pass is trimmed from sites/avcart/public/refry.js's
// _composeSlide (copy, don't abstract) — same chromatic-aberration idea,
// applied once to a still image instead of once per slideshow frame.

// mulberry32 — small, fast, deterministic. Seeded from a string via a cheap
// hash so "handle + year-month + door number" always yields the same art.
export function seedFrom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ["#ff2f7e", "#2fe2ff", "#fff23f"],
  ["#7cffb2", "#ff5fd1", "#5f9dff"],
  ["#ffb84d", "#4dd9ff", "#c04dff"],
  ["#ff4d4d", "#4dffea", "#f8ff4d"],
  ["#a3ff4d", "#4d6dff", "#ff4dc4"],
];

// Procedural glitch art: colour-bar blocks + a scanline/noise pass, all from
// one seeded RNG so the same door always regenerates the same image.
export function drawGlitchArt(canvas, seedStr) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;
  const rnd = mulberry32(seedFrom(seedStr));
  const palette = PALETTES[Math.floor(rnd() * PALETTES.length)];

  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, W, H);

  // layered horizontal glitch bars
  const bars = 18 + Math.floor(rnd() * 20);
  for (let i = 0; i < bars; i++) {
    const y = rnd() * H;
    const h = 2 + rnd() * (H * 0.09);
    const x = (rnd() - 0.3) * W * 0.4;
    const w = W * (0.5 + rnd() * 0.9);
    ctx.globalAlpha = 0.35 + rnd() * 0.5;
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(x, y, w, h);
  }

  // a few blocky "corruption" rectangles
  ctx.globalAlpha = 1;
  const blocks = 4 + Math.floor(rnd() * 6);
  for (let i = 0; i < blocks; i++) {
    const w = W * (0.08 + rnd() * 0.22);
    const h = H * (0.08 + rnd() * 0.22);
    const x = rnd() * (W - w);
    const y = rnd() * (H - h);
    ctx.fillStyle = palette[(i + 1) % palette.length];
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x, y, w, h);
    // a thin offset "ghost" copy for a torn-signal look
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(x + (rnd() - 0.5) * 24, y + (rnd() - 0.5) * 10, w, h * 0.4);
  }

  ctx.globalAlpha = 1;
  addScanlinesAndNoise(ctx, W, H, rnd);
}

// A real photo, run through a lighter version of the same treatment: cover-fit
// draw, a subtle per-pixel R/B channel shift, then soft scanlines + vignette.
// Deterministic per photo URL, so a redraw (share card vs. door modal) never
// looks different. Tuned down 2026-09-06 after a report that the photo doors
// were coming out as unrecognizable static — the point is "glitchy photo",
// not "snow".
export function drawGlitchPhoto(canvas, img, seedStr) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;
  const rnd = mulberry32(seedFrom(seedStr));

  const base = document.createElement("canvas");
  base.width = W;
  base.height = H;
  const bctx = base.getContext("2d");
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * scale,
    h = img.naturalHeight * scale;
  bctx.filter = "saturate(1.35) contrast(1.08) brightness(1.02) hue-rotate(-3deg)";
  bctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);

  ctx.clearRect(0, 0, W, H);
  try {
    const src = bctx.getImageData(0, 0, W, H);
    const out = bctx.createImageData(W, H);
    const shift = 1 + Math.floor(rnd() * 3);
    for (let y = 0; y < H; y++) {
      const row = y * W * 4;
      for (let x = 0; x < W; x++) {
        const i = row + x * 4;
        const rx = Math.min(W - 1, x + shift);
        const bx = Math.max(0, x - shift);
        out.data[i] = src.data[row + rx * 4];
        out.data[i + 1] = src.data[i + 1];
        out.data[i + 2] = src.data[row + bx * 4 + 2];
        out.data[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  } catch {
    ctx.drawImage(base, 0, 0); // canvas got tainted (cross-origin photo) — plain filtered draw instead
  }

  // a couple of thin horizontal tears, in the same spirit as avcart's refry.js
  const tears = 1 + Math.floor(rnd() * 3);
  const snapshot = document.createElement("canvas");
  snapshot.width = W;
  snapshot.height = H;
  snapshot.getContext("2d").drawImage(canvas, 0, 0);
  for (let i = 0; i < tears; i++) {
    const y = Math.floor(rnd() * H);
    const sliceH = 2 + Math.floor(rnd() * 8);
    const dx = (rnd() - 0.5) * 16;
    ctx.drawImage(snapshot, 0, y, W, sliceH, dx, y, W, sliceH);
  }

  // photos get a gentler pass than pure procedural art — the photo underneath
  // should still read as a photo, just roughed up.
  addScanlinesAndNoise(ctx, W, H, rnd, { scanAlpha: 0.07, noiseAlpha: 0.025, vignette: 0.32 });
}

function addScanlinesAndNoise(ctx, W, H, rnd, opts = {}) {
  const scanAlpha = opts.scanAlpha ?? 0.14;
  const noiseAlpha = opts.noiseAlpha ?? 0.06;
  const vignette = opts.vignette ?? 0.5;

  ctx.save();
  ctx.globalAlpha = scanAlpha;
  ctx.fillStyle = "#000";
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = noiseAlpha;
  const id = ctx.createImageData(W, H);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  ctx.restore();

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${vignette})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

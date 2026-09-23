// Generates public/og.png — the static Open Graph preview card for badapple,
// so a shared link unfurls as something real in Bluesky. Hand-drawn SVG,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium —
// this box has no fontconfig either, so the font is bundled in ./fonts and
// loaded explicitly, same recipe as sites/didscope/og-gen.mjs).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// The "art" on the right is a generic pixel-block apple silhouette — not a
// frame of the actual Bad Apple!! video, which this repo has no license to
// ship. Re-run this by hand if you change it.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const W = 1200, H = 630;

const BG = "#050505", BG2 = "#101010", FG = "#f0f0f0", DIM = "#7a7a7a", ACCENT = "#ff5f5f";

// A small pixel-block apple: body as a circle with a top-center dent, plus a
// leaf, sampled onto a coarse grid so it reads as "ascii block art".
const COLS = 26, ROWS = 22, CELL = 16;
const cx = COLS / 2, cy = ROWS / 2 + 1, r = 9.5;
const cells = [];
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const dx = x + 0.5 - cx;
    const dy = (y + 0.5 - cy) * 1.05;
    let on = dx * dx + dy * dy <= r * r;
    // dent at the top center (the classic apple silhouette notch)
    if (on && Math.abs(dx) < 2.2 && dy < -r + 3.5) on = false;
    // stem
    if (Math.abs(dx) < 0.6 && dy >= -r - 2 && dy < -r + 1) on = true;
    // leaf, a small triangle-ish blob to the stem's right
    const lx = dx - 1.6, ly = dy + r - 1.5;
    if (lx * lx * 2.2 + ly * ly * 5 <= 3) on = true;
    if (on) cells.push([x, y]);
  }
}

const gridW = COLS * CELL, gridH = ROWS * CELL;
const gridX = W - gridW - 90;
const gridY = (H - gridH) / 2;

const blocks = cells
  .map(([x, y]) => `<rect x="${gridX + x * CELL}" y="${gridY + y * CELL}" width="${CELL - 2}" height="${CELL - 2}" fill="${FG}"/>`)
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#2a2a2a" stroke-width="1.5" rx="16"/>

  <text x="90" y="230" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">badapple</text>
  <text x="90" y="272" font-family="JetBrains Mono" font-size="22" fill="${DIM}">.bisks.net</text>

  <text x="90" y="330" font-family="JetBrains Mono" font-size="24" fill="${ACCENT}">does it run Bad Apple?</text>
  <text x="90" y="380" font-family="JetBrains Mono" font-size="18" fill="${DIM}">point a webcam or any video file at it —</text>
  <text x="90" y="408" font-family="JetBrains Mono" font-size="18" fill="${DIM}">watch it become a live ASCII silhouette,</text>
  <text x="90" y="436" font-family="JetBrains Mono" font-size="18" fill="${DIM}">right in your browser.</text>

  <rect x="${gridX - 24}" y="${gridY - 24}" width="${gridW + 48}" height="${gridH + 48}" rx="14" fill="${BG2}" stroke="#2a2a2a" stroke-width="1.5"/>
  ${blocks}
</svg>`;

const fontPath = new URL("./fonts/JetBrainsMono.ttf", import.meta.url).pathname;
const r2 = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r2.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

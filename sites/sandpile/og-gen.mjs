// Generates public/og.png — the Open Graph preview card for sandpile.
//
// Runs the real abelian sandpile toppling algorithm (same rules as
// public/app.js, just headless and single-shot instead of animated) on a
// small grid, then rasterises the actual stable result — not a decorative
// stand-in — as colored squares. Cheap enough in plain Node that there's no
// reason to fake it. Rasterised with @resvg/resvg-js, same approach as
// sites/cymatics/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#fbf3e6", MUTED = "#b3a48c", ACCENT = "#e8b86d";
const CLAY = ["#241a12", "#6b4326", "#b0713a", "#e8b86d"];

// --- Run the real toppling algorithm to completion (no animation needed for
// a static image) ------------------------------------------------------------
const N = 121; // odd, so there's a true center cell
const grid = new Int32Array(N * N);
const queue = [];
let head = 0;

function bump(idx) {
  grid[idx]++;
  if (grid[idx] === 4) queue.push(idx);
}

const center = (N - 1) / 2;
grid[center * N + center] = Math.round(N * N * 0.55);
queue.push(center * N + center);

while (head < queue.length) {
  const idx = queue[head++];
  if (grid[idx] < 4) continue;
  grid[idx] -= 4;
  const x = idx % N, y = (idx / N) | 0;
  if (x > 0) bump(idx - 1);
  if (x < N - 1) bump(idx + 1);
  if (y > 0) bump(idx - N);
  if (y < N - 1) bump(idx + N);
  if (grid[idx] >= 4) queue.push(idx);
}

// --- Rasterise the stable grid as colored squares ---------------------------
const PLATE = 470; // px, inscribed square
const PLATE_X = 640, PLATE_Y = (H - PLATE) / 2 + 10;
const cell = PLATE / N;
const rects = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const h = grid[y * N + x];
    if (h === 0) continue; // background already shows through
    const color = CLAY[h > 3 ? 3 : h];
    const px = PLATE_X + x * cell, py = PLATE_Y + y * cell;
    rects.push(`<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(cell + 0.4).toFixed(1)}" height="${(cell + 0.4).toFixed(1)}" fill="${color}"/>`);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.62" cy="0.5" r="1.0">
      <stop offset="0" stop-color="#1a120a"/>
      <stop offset="1" stop-color="#0a0805"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="${PLATE_X - 8}" y="${PLATE_Y - 8}" width="${PLATE + 16}" height="${PLATE + 16}" rx="10" fill="none" stroke="#3a2a18" stroke-width="2"/>
  <g>
  ${rects.join("\n  ")}
  </g>

  <text x="56" y="110" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${INK}">sandpile</text>
  <text x="56" y="150" font-family="JetBrains Mono" font-weight="600" font-size="21" fill="${MUTED}">every pile finds the same shape</text>

  <text x="56" y="210" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${MUTED}">drop chips, watch cells of 4+ topple into their neighbors,</text>
  <text x="56" y="240" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${MUTED}">and watch the cascade settle into a fractal every time.</text>

  <text x="56" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">sandpile.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const rr = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = rr.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

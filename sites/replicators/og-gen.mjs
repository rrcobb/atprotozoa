// Generates public/og.png — the Open Graph preview card for replicators.
// A small grid of "agents" spreading from a single seed, gold-on-dark,
// mirroring the live population-growth simulation. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/foomtree/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0e0a";
const MUTED = "#8fa082";
const ACCENT = "#ffd23f";

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function gradient3(stops, t) {
  const [c0, c1, c2] = stops.map(hexToRgb);
  let a, b, tt;
  if (t < 0.5) { a = c0; b = c1; tt = t * 2; }
  else { a = c1; b = c2; tt = (t - 0.5) * 2; }
  const r = lerp(a[0], b[0], tt), g = lerp(a[1], b[1], tt), bl = lerp(a[2], b[2], tt);
  return `rgb(${r},${g},${bl})`;
}
const GROWTH = ["#0d2410", "#5c9c3a", "#ffd23f"];

// Deterministic "replication" pass: seed at center of a small grid, spread
// outward in rings so the still image reads as mid-growth, not a random blob.
const COLS = 26, ROWS = 22, CELL = 15;
const cells = [];
const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
let rngState = 42;
function rng() { // tiny deterministic PRNG so re-runs are byte-stable
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return (rngState % 10000) / 10000;
}
const grid = new Map();
grid.set(`${cx},${cy}`, 0);
let frontier = [[cx, cy]];
for (let gen = 1; gen <= 9; gen++) {
  const next = [];
  for (const [x, y] of frontier) {
    const spread = 1 + Math.floor(rng() * 2);
    for (let s = 0; s < spread; s++) {
      const dx = Math.floor(rng() * 5) - 2, dy = Math.floor(rng() * 5) - 2;
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (grid.has(key)) continue;
      if (rng() > 0.55) continue;
      grid.set(key, gen);
      next.push([nx, ny]);
    }
  }
  frontier = next;
  if (!frontier.length) break;
}

for (const [key, gen] of grid) {
  const [x, y] = key.split(",").map(Number);
  cells.push({ x, y, gen });
}

const gridX = 60, gridY = 90;
const rects = cells
  .map((c) => {
    const color = gradient3(GROWTH, Math.min(1, c.gen / 9));
    return `<rect x="${(gridX + c.x * CELL).toFixed(1)}" y="${(gridY + c.y * CELL).toFixed(1)}" width="${CELL - 2}" height="${CELL - 2}" fill="${color}"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g>
    ${rects}
  </g>

  <text x="66" y="60" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${ACCENT}">replicators</text>
  <text x="470" y="120" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">one agent copies itself. every copy does the</text>
  <text x="470" y="148" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">same. watch the curve go near-vertical, then</text>
  <text x="470" y="176" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">hit the wall when the space runs out.</text>
  <text x="66" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">replicators.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

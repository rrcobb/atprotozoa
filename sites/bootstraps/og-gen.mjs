// Generates public/og.png — the Open Graph preview card for bootstraps.
// A small robot body grown from a single core block, blocks colored by
// category (sense/move/think/power/meta), mirroring the live sim. Rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/replicators/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e12";
const MUTED = "#7c93a3";
const ACCENT = "#4fd1ff";
const CORE = "#f4f7fa";

const CAT_COLORS = ["#4fd1ff", "#7cff6b", "#c792ea", "#ffd23f", "#ff9f43"]; // sense, move, think, power, meta

// Deterministic growth pass: seed at center of a small grid, spread outward
// so the still image reads as a robot mid-build, not a random blob.
const COLS = 22, ROWS = 18, CELL = 20;
const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
let rngState = 7;
function rng() { // tiny deterministic PRNG so re-runs are byte-stable
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return (rngState % 10000) / 10000;
}
const grid = new Map();
grid.set(`${cx},${cy}`, "core");
let frontier = [[cx, cy]];
for (let gen = 1; gen <= 11; gen++) {
  const next = [];
  for (const [x, y] of frontier) {
    const spread = 1 + Math.floor(rng() * 2);
    for (let s = 0; s < spread; s++) {
      const dx = Math.floor(rng() * 3) - 1, dy = Math.floor(rng() * 3) - 1;
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (grid.has(key)) continue;
      if (rng() > 0.62) continue;
      const color = CAT_COLORS[Math.floor(rng() * CAT_COLORS.length)];
      grid.set(key, color);
      next.push([nx, ny]);
    }
  }
  frontier = next;
  if (!frontier.length) break;
}

const cells = [];
for (const [key, color] of grid) {
  const [x, y] = key.split(",").map(Number);
  cells.push({ x, y, color });
}

const gridX = 60, gridY = 100;
const rects = cells
  .map((c) => {
    const fill = c.color === "core" ? CORE : c.color;
    return `<rect x="${(gridX + c.x * CELL).toFixed(1)}" y="${(gridY + c.y * CELL).toFixed(1)}" width="${CELL - 2}" height="${CELL - 2}" fill="${fill}"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g>
    ${rects}
  </g>

  <text x="66" y="60" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${ACCENT}">bootstraps</text>
  <text x="66" y="560" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a robot that improves itself by bolting new</text>
  <text x="66" y="588" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">blocks onto its own body — some blocks make</text>
  <text x="66" y="616" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">the next block arrive faster.</text>
  <text x="900" y="60" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bootstraps.bisks.net</text>
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

// Generates public/og.png — the Open Graph preview card for genepool.
// A small deterministic maze with a bred robot's path through it, gold coins
// and a teal trail, mirroring the live evolution simulation. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed).
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
const BG = "#0a0e14";
const MUTED = "#7d8ba3";
const ACCENT = "#4fd1c5";
const GOLD = "#ffb454";
const WALL = "#1c2740";

// Deterministic little maze + path, so re-runs are byte-stable.
const COLS = 16, ROWS = 12, CELL = 22;
let rngState = 7;
function rng() {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return (rngState % 10000) / 10000;
}
const walls = new Set();
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    if (rng() < 0.14) walls.add(`${x},${y}`);
  }
}
const start = { x: 1, y: 5 };
walls.delete(`${start.x},${start.y}`);

const coins = [];
while (coins.length < 5) {
  const x = Math.floor(rng() * COLS), y = Math.floor(rng() * ROWS);
  const key = `${x},${y}`;
  if (x === start.x && y === start.y) continue;
  if (walls.has(key)) continue;
  if (coins.some((c) => c.x === x && c.y === y)) continue;
  coins.push({ x, y });
}

// A meandering path from start that visits every coin — hand-walked via
// greedy nearest-uncollected-coin steps, just for the still image.
const path = [[start.x, start.y]];
let cx = start.x, cy = start.y;
const remaining = coins.slice();
while (remaining.length) {
  remaining.sort((a, b) => (Math.abs(a.x - cx) + Math.abs(a.y - cy)) - (Math.abs(b.x - cx) + Math.abs(b.y - cy)));
  const target = remaining.shift();
  while (cx !== target.x) { cx += cx < target.x ? 1 : -1; path.push([cx, cy]); }
  while (cy !== target.y) { cy += cy < target.y ? 1 : -1; path.push([cx, cy]); }
}

const gridX = 60, gridY = 70;
const wallRects = [...walls]
  .map((key) => {
    const [x, y] = key.split(",").map(Number);
    return `<rect x="${gridX + x * CELL}" y="${gridY + y * CELL}" width="${CELL - 2}" height="${CELL - 2}" fill="${WALL}"/>`;
  })
  .join("\n  ");
const coinShapes = coins
  .map((c) => `<circle cx="${gridX + c.x * CELL + CELL / 2}" cy="${gridY + c.y * CELL + CELL / 2}" r="${CELL * 0.28}" fill="${GOLD}"/>`)
  .join("\n  ");
const pathPoints = path.map(([x, y]) => `${gridX + x * CELL + CELL / 2},${gridY + y * CELL + CELL / 2}`).join(" ");
const last = path[path.length - 1];
const robotX = gridX + last[0] * CELL + CELL / 2, robotY = gridY + last[1] * CELL + CELL / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="${gridX - 6}" y="${gridY - 6}" width="${COLS * CELL + 8}" height="${ROWS * CELL + 8}" fill="#070b10" rx="6"/>
  <g>
    ${wallRects}
  </g>
  <polyline points="${pathPoints}" fill="none" stroke="${ACCENT}" stroke-opacity="0.6" stroke-width="3"/>
  <g>
    ${coinShapes}
  </g>
  <circle cx="${gridX + start.x * CELL + CELL / 2}" cy="${gridY + start.y * CELL + CELL / 2}" r="5" fill="${ACCENT}"/>
  <circle cx="${robotX}" cy="${robotY}" r="8" fill="${ACCENT}" stroke="#08130f" stroke-width="2"/>

  <text x="450" y="115" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${ACCENT}">genepool</text>
  <text x="450" y="165" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a population of robots evolves, generation by</text>
  <text x="450" y="193" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">generation, to get better at collecting coins</text>
  <text x="450" y="221" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">in a maze you draw yourself.</text>
  <text x="60" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">genepool.bisks.net</text>
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

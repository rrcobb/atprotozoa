// Generates public/og.png — the Open Graph preview card for activitygrid, so a
// shared link auto-renders a picture of the contribution grid in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, matching the
// live page's GitHub-dark look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample grid (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-handle share cards are generated
// live, client-side, in public/index.html (drawCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d1117", FG = "#e6edf3", DIM = "#7d8590";
const ACCENT = "#39d353", ACCENT2 = "#58a6ff", BORDER = "#30363d";
const LEVELS = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A deterministic-looking fake year of activity: pseudo-random but seeded so
// re-runs produce the same sample card.
function fakeSeed(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
function fakeCount(col, row) {
  const n = fakeSeed(col * 7 + row + 1);
  if (n < 0.45) return 0;
  if (n < 0.7) return 1;
  if (n < 0.85) return 2;
  if (n < 0.95) return 4;
  return 7;
}

const CELL = 11, GAP = 3, STEP = CELL + GAP;
const originX = 690, originY = 240;

let cellsSvg = "";
for (let col = 0; col < 53; col++) {
  for (let row = 0; row < 7; row++) {
    const count = fakeCount(col, row);
    const level = count === 0 ? 0 : count < 2 ? 1 : count < 3 ? 2 : count < 5 ? 3 : 4;
    const x = originX + col * STEP;
    const y = originY + row * STEP;
    cellsSvg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${LEVELS[level]}"/>\n  `;
  }
}

let legendSvg = "";
const legendX = 1140 - 5 * STEP, legendY = originY + 7 * STEP + 26;
for (let i = 0; i < 5; i++) {
  legendSvg += `<rect x="${legendX + i * STEP}" y="${legendY}" width="${CELL}" height="${CELL}" rx="2" fill="${LEVELS[i]}"/>\n  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#113322"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">activitygrid</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a GitHub-style contribution</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">graph for your <tspan fill="${ACCENT2}">Bluesky</tspan> posts</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a handle. Get a year of</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">posting activity as one green</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">grid, ready to share.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">bisks.net/activitygrid</text>

  ${cellsSvg}
  ${legendSvg}
  <text x="${legendX - 40}" y="${legendY + CELL}" text-anchor="end" font-family="JetBrains Mono" font-size="13" fill="${DIM}">Less</text>
  <text x="${legendX + 5 * STEP + 10}" y="${legendY + CELL}" font-family="JetBrains Mono" font-size="13" fill="${DIM}">More</text>
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

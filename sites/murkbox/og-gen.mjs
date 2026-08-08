// Generates public/og.png — the Open Graph preview card for murkbox.
// Hand-drawn SVG at the canonical OG size, matching the live page's
// stompbox look, rasterised with @resvg/resvg-js (no system fonts on this
// box, so JetBrains Mono ships bundled in ./fonts — same recipe as
// sites/didscope/og-gen.mjs).
//
// The right-hand "screen" is a real generated ordered (Bayer 4x4) dither of
// a two-colour gradient — not a stand-in graphic, the actual algorithm the
// live pedal applies to a feed, rendered here as a grid of <rect>s.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#141118", PANEL = "#1c1820", FG = "#f3ecff", DIM = "#9c8fae";
const ACCENT = "#ff5a3c", ACCENT2 = "#5ad1c9", METAL = "#2a2530", BORDER = "#413a4a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- generated ordered-dither gradient strip (the actual Bayer 4x4 algo) --
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

function ditherGrid(cols, rows, colorLo, colorHi) {
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = x / (cols - 1); // gradient position, left->right
      const threshold = BAYER4[y % 4][x % 4];
      cells.push({ x, y, on: t > threshold });
    }
  }
  return cells;
}

const screenX = 640, screenY = 96, screenW = 460, screenH = 300;
const gridCols = 46, gridRows = 30;
const cellW = screenW / gridCols, cellH = screenH / gridRows;
const cells = ditherGrid(gridCols, gridRows, BG, ACCENT2);
const cellsSvg = cells
  .map((c) => {
    if (!c.on) return "";
    const x = screenX + c.x * cellW;
    const y = screenY + c.y * cellH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cellW + 0.6).toFixed(1)}" height="${(cellH + 0.6).toFixed(1)}" fill="${ACCENT2}"/>`;
  })
  .join("");

// a few lo-poly "post card" blocks sitting under the dither, like the pedal's
// own screen showing a degraded feed
const blocks = [
  { x: screenX + 24, y: screenY + 24, w: 130, h: 34, c: "#3a3244" },
  { x: screenX + 24, y: screenY + 70, w: 200, h: 18, c: "#4a4054" },
  { x: screenX + 24, y: screenY + 96, w: 160, h: 18, c: "#4a4054" },
];
const blocksSvg = blocks
  .map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4" fill="${b.c}" opacity="0.55"/>`)
  .join("\n    ");

// knob row below the screen
const knobY = screenY + screenH + 56;
const knobLabels = ["BLOCK", "DEPTH", "DITHER", "MURK"];
const knobsSvg = knobLabels
  .map((label, i) => {
    const cx = screenX + 60 + i * 118;
    const angle = -110 + i * 62; // just decorative, varied rotation
    const rad = (angle * Math.PI) / 180;
    const x2 = cx + Math.cos(rad) * 22;
    const y2 = knobY + Math.sin(rad) * 22;
    return `
    <circle cx="${cx}" cy="${knobY}" r="30" fill="${METAL}" stroke="${BORDER}" stroke-width="2"/>
    <line x1="${cx}" y1="${knobY}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>
    <text x="${cx}" y="${knobY + 52}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="1" fill="${DIM}">${label}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="65%">
      <stop offset="0" stop-color="#3a1f2c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <clipPath id="screenClip">
      <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="10"/>
    </clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">murkbox</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">an effects pedal for your</text>
  <text x="64" y="224" font-family="JetBrains Mono" font-size="21" fill="${DIM}"><tspan fill="${ACCENT2}">bluesky appview</tspan>'s clarity</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Lo-poly colour blocks, ordered dither</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">gradients, grain, chromatic drift —</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">seven knobs and a stomp switch on a</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">live feed of your choosing.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">murkbox.bisks.net</text>

  <!-- right: pedal enclosure -->
  <rect x="596" y="52" width="548" height="470" rx="22" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="10" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
  <g clip-path="url(#screenClip)">
    ${blocksSvg}
    ${cellsSvg}
  </g>
  ${knobsSvg}
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

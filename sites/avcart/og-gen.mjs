// Generates public/og.png — the Open Graph preview card for avcart. A dark
// classroom silhouette, rows of desks, and a glowing "refried" CRT screen on
// the AV cart, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/cantilever/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;
const BG = "#0c0a07",
  FG = "#f3ecdd",
  DIM = "#b9ab8e",
  ACCENT = "#8fc7ff",
  ACCENT2 = "#ffb15c";

let seed = 20260806;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// A grid of desks, drawn small and dim in the lower-left third — reads as
// "classroom" without needing real geometry.
let desks = "";
const deskCols = 6,
  deskRows = 3;
const deskX0 = 60,
  deskY0 = 430,
  deskDX = 66,
  deskDY = 46;
for (let r = 0; r < deskRows; r++) {
  for (let c = 0; c < deskCols; c++) {
    const x = deskX0 + c * deskDX + (rand() - 0.5) * 6;
    const y = deskY0 + r * deskDY + (rand() - 0.5) * 4;
    desks += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="40" height="20" rx="2" fill="#3a2f22" opacity="0.85"/>\n`;
    if (rand() < 0.4) {
      desks += `<circle cx="${(x + 20).toFixed(1)}" cy="${(y - 6).toFixed(1)}" r="6" fill="#5a4632"/>\n`;
    }
  }
}

// The CRT screen: a scanline-and-noise mosaic standing in for the refried
// slideshow, glowing on a cart at screen-right.
const scX = 700,
  scY = 90,
  scW = 430,
  scH = 320;
let staticRows = "";
const rowH = 5;
for (let y = 0; y < scH; y += rowH) {
  if (rand() < 0.6) continue;
  const hue = rand() < 0.5 ? ACCENT : ACCENT2;
  const w = 30 + rand() * (scW - 60);
  const x = scX + 10 + rand() * (scW - 20 - w);
  staticRows += `<rect x="${x.toFixed(1)}" y="${scY + y}" width="${w.toFixed(1)}" height="${rowH - 1}" fill="${hue}" opacity="${(0.08 + rand() * 0.2).toFixed(2)}"/>\n`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="60%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a1510"/>
      <stop offset="1" stop-color="#0c0a07"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="380" width="${W}" height="250" fill="url(#floor)"/>

  <circle cx="${scX + scW / 2}" cy="${scY + scH / 2}" r="320" fill="url(#glow)"/>

  <!-- AV cart -->
  <rect x="${scX + scW / 2 - 6}" y="${scY + scH + 10}" width="12" height="90" fill="#3a3f47"/>
  <circle cx="${scX + scW / 2 - 40}" cy="${scY + scH + 108}" r="14" fill="#111"/>
  <circle cx="${scX + scW / 2 + 40}" cy="${scY + scH + 108}" r="14" fill="#111"/>
  <rect x="${scX + scW / 2 - 60}" y="${scY + scH + 92}" width="120" height="18" rx="3" fill="#4a5058"/>

  <!-- TV body + screen -->
  <rect x="${scX - 22}" y="${scY - 22}" width="${scW + 44}" height="${scH + 44}" rx="10" fill="#26251f"/>
  <rect x="${scX}" y="${scY}" width="${scW}" height="${scH}" rx="4" fill="#0e1216"/>
  ${staticRows}
  <rect x="${scX}" y="${scY}" width="${scW}" height="${scH}" rx="4" fill="none" stroke="#000" stroke-width="6" opacity="0.5"/>

  ${desks}

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">avcart</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${ACCENT}">movie day, forever</text>

  <text x="64" y="260" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Pick a seat in a shared 3D classroom.</text>
  <text x="64" y="288" font-family="JetBrains Mono" font-size="18" fill="${DIM}">The AV cart plays whoever's feed the</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="18" fill="${DIM}">room picked — refried, glitchy, with a</text>
  <text x="64" y="344" font-family="JetBrains Mono" font-size="18" fill="${DIM}">procedural corecore soundtrack.</text>

  <text x="64" y="576" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">avcart.bisks.net</text>
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

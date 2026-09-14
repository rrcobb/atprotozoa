// Generates public/og.png — the Open Graph preview card for cymatics.
//
// A static stand-in for what the live simulation traces: a superposed
// two-mode Chladni figure (n=3, m=5, the "classic" recipe from public/app.js)
// sampled on a small grid and drawn as glowing dots wherever |amplitude| is
// near zero — the real math, not the live particle sim (that needs a browser
// canvas; this needs to render once at build time). Rasterised with
// @resvg/resvg-js, same approach as sites/physarum/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f2f5ff", MUTED = "#9aa3c0", GOLD = "#ffcf4d", CYAN = "#8fd6ff";

// --- Sample the classic-recipe (n=3, m=5) mode shape onto a dot grid --------
function amplitude(nx, ny, n, m) {
  const a = Math.cos(n * Math.PI * nx) * Math.cos(m * Math.PI * ny);
  const b = Math.cos(m * Math.PI * nx) * Math.cos(n * Math.PI * ny);
  return a - b;
}

const PLATE = 470; // px, inscribed square
const PLATE_X = 640, PLATE_Y = (H - PLATE) / 2 + 10;
const N = 3, M = 5;
const GRID = 130;
const dots = [];
for (let iy = 0; iy < GRID; iy++) {
  for (let ix = 0; ix < GRID; ix++) {
    const nx = (ix / (GRID - 1)) * 2 - 1;
    const ny = (iy / (GRID - 1)) * 2 - 1;
    const amp = Math.abs(amplitude(nx, ny, N, M));
    if (amp > 0.12) continue; // only render near the nodal lines, like settled sand
    const px = PLATE_X + ((nx + 1) / 2) * PLATE;
    const py = PLATE_Y + ((ny + 1) / 2) * PLATE;
    const r = 2.6 - amp * 8;
    dots.push({ px, py, r: Math.max(0.8, r), amp });
  }
}

const dotsSvg = dots
  .map((d) => {
    const o = 1 - d.amp / 0.12;
    return `<circle cx="${d.px.toFixed(1)}" cy="${d.py.toFixed(1)}" r="${d.r.toFixed(2)}" fill="${CYAN}" opacity="${(0.35 + o * 0.65).toFixed(2)}"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.62" cy="0.5" r="1.0">
      <stop offset="0" stop-color="#111826"/>
      <stop offset="1" stop-color="#07080c"/>
    </radialGradient>
    <filter id="soften" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="0.5"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="${PLATE_X - 8}" y="${PLATE_Y - 8}" width="${PLATE + 16}" height="${PLATE + 16}" rx="10" fill="none" stroke="#2a3550" stroke-width="2"/>
  <g filter="url(#soften)">
  ${dotsSvg}
  </g>

  <text x="56" y="110" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${INK}">cymatics</text>
  <text x="56" y="150" font-family="JetBrains Mono" font-weight="600" font-size="21" fill="${MUTED}">a plate finds its own resonance</text>

  <text x="56" y="210" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${MUTED}">sand bounces off the loud parts of a vibrating plate</text>
  <text x="56" y="240" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${MUTED}">and settles on the quiet ones — tune it, tap it, ring it.</text>

  <text x="56" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">cymatics.bisks.net</text>
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

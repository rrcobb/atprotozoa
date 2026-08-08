// Generates public/og.png — the Open Graph preview card for fractopolis.
// Renders the *actual* recursive city algorithm (same hashCombine/mulberry32
// + 3x3-grid-with-road-gaps recursion as public/index.html's <canvas> code,
// ported to SVG rects) so the preview is a real fractal, not a mockup.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#e3e9f4", DIM = "#8891a6", ROAD = "#14161d";
const SEED = 20260808;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashCombine(seed, i) {
  let a = (seed ^ Math.imul(i + 0x9e3779b9, 2654435761)) >>> 0;
  a = Math.imul(a ^ (a >>> 16), 2246822519) >>> 0;
  a = Math.imul(a ^ (a >>> 13), 3266489917) >>> 0;
  return (a ^ (a >>> 16)) >>> 0;
}

const ROAD_FRAC = 0.075;
const LEAF_PX = 26;
const MAX_LOCAL_DEPTH = 5;

let svg = "";

function leaf(x, y, w, h, seed, isCenter) {
  const rng = mulberry32(seed);
  if (isCenter) {
    const hue = (125 + rng() * 20 - 10).toFixed(0);
    svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="hsl(${hue},40%,${(16 + rng() * 8).toFixed(0)}%)"/>`;
    if (w > 10 && h > 10) {
      const r = Math.min(w, h) * (0.16 + rng() * 0.1);
      svg += `<circle cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" r="${r.toFixed(1)}" fill="hsl(${hue},45%,${(26 + rng() * 10).toFixed(0)}%)"/>`;
    }
    return;
  }
  const hue = ((200 + rng() * 40) % 360).toFixed(0);
  const light = (22 + rng() * 30).toFixed(0);
  const sat = (45 + rng() * 25).toFixed(0);
  svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="hsl(${hue},${sat}%,${light}%)"/>`;
  if (w >= 20 && h >= 20) {
    const cols = w > 44 ? 3 : 2, rows = h > 44 ? 3 : 2;
    const pad = Math.min(w, h) * 0.14;
    const gw = (w - pad * 2) / cols, gh = (h - pad * 2) / rows;
    const winW = gw * 0.55, winH = gh * 0.55;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < 0.4;
        svg += `<rect x="${(x + pad + c * gw + (gw - winW) / 2).toFixed(1)}" y="${(y + pad + r * gh + (gh - winH) / 2).toFixed(1)}" width="${winW.toFixed(1)}" height="${winH.toFixed(1)}" fill="${lit ? "rgba(255,214,120,0.85)" : "rgba(0,0,0,0.28)"}"/>`;
      }
    }
  }
}

function renderCell(x, y, w, h, seed, localDepth, isCenter) {
  const gx = Math.max(0.6, w * ROAD_FRAC), gy = Math.max(0.6, h * ROAD_FRAC);
  const cellW = (w - 4 * gx) / 3, cellH = (h - 4 * gy) / 3;
  const isLeaf = localDepth >= MAX_LOCAL_DEPTH || w < LEAF_PX || h < LEAF_PX || cellW < 1 || cellH < 1;
  if (isLeaf) return leaf(x, y, w, h, seed, isCenter);

  svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${ROAD}"/>`;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const cx = x + gx + col * (cellW + gx);
      const cy = y + gy + row * (cellH + gy);
      renderCell(cx, cy, cellW, cellH, hashCombine(seed, idx), localDepth + 1, idx === 4);
    }
  }
}

const panelX = 24, panelY = 24, panelSize = H - 48;
renderCell(panelX, panelY, panelSize, panelSize, SEED, 0, false);

const tx = panelX + panelSize + 40;

const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0a0d13"/>
  ${svg}
  <text x="${tx}" y="${panelY + 70}" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">fractopolis</text>
  <text x="${tx}" y="${panelY + 116}" font-family="JetBrains Mono" font-weight="600" font-size="22" fill="${INK}">a city made of smaller</text>
  <text x="${tx}" y="${panelY + 146}" font-family="JetBrains Mono" font-weight="600" font-size="22" fill="${INK}">identical versions of itself.</text>
  <text x="${tx}" y="${panelY + 176}" font-family="JetBrains Mono" font-weight="600" font-size="22" fill="${INK}">click a block — it's a city too.</text>
  <text x="${tx}" y="${panelY + panelSize - 40}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">fractopolis.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(fullSvg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

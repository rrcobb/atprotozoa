// Generates public/og.png — the Open Graph preview card for liquid chess.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Blobs are drawn as organic
// closed paths (a jittered-radius polygon smoothed with Catmull-Rom
// splines) rather than relying on an SVG blur+contrast "goo" filter, since
// that's not reliably supported by static SVG rasterisers.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#060d13", FG = "#eaf7f6", DIM = "#7fa3aa";
const ACCENT = "#5be7c4", ACCENT2 = "#9fe8ff", CARD = "#0e1e28", BORDER = "#16323d";
const WHITE_LIQ = "#9fe8ff", WHITE_LIQ_DARK = "#4fc3e0", WHITE_GLYPH = "#08313f";
const BLACK_LIQ = "#8a76e0", BLACK_LIQ_DARK = "#2a1f52", BLACK_GLYPH = "#ece5ff";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blobPath(cx, cy, baseR, seed, points = 9, variance = 0.22) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = baseR * (1 - variance / 2 + rnd() * variance);
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `;
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % points];
    const p3 = pts[(i + 2) % points];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  d += "Z";
  return d;
}

// --- mini liquid-chess card, right side ---
const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const gridSize = 6;
const gridPad = 44;
const cellW = (cardW - gridPad * 2) / gridSize;
const cellH = (cardH - gridPad * 2 - 60) / gridSize;
const gridX = cardX + gridPad;
const gridY = cardY + 40;

let squaresSvg = "";
for (let r = 0; r < gridSize; r++) {
  for (let c = 0; c < gridSize; c++) {
    const light = (r + c) % 2 === 0;
    squaresSvg += `<rect x="${(gridX + c * cellW).toFixed(1)}" y="${(gridY + r * cellH).toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="${light ? "#cbe9e4" : "#24515e"}"/>\n`;
  }
}

// A handful of droplets scattered across the mini board, mixing sizes and
// sides, each carrying a glyph so it still reads as chess at a glance.
// Letters, not unicode chess glyphs — the bundled font has no coverage for
// U+265A-265F and renders them as tofu boxes. Algebraic-notation-style
// uppercase/lowercase for white/black doubles as the pictogram.
const placements = [
  { r: 0, c: 1, glyph: "r", color: "b", size: 0.62 },
  { r: 0, c: 4, glyph: "n", color: "b", size: 0.58 },
  { r: 1, c: 2, glyph: "q", color: "b", size: 0.72 },
  { r: 4, c: 3, glyph: "Q", color: "w", size: 0.7 },
  { r: 5, c: 1, glyph: "P", color: "w", size: 0.5 },
  { r: 5, c: 4, glyph: "K", color: "w", size: 0.66 },
];

let blobsSvg = "";
let glyphsSvg = "";
placements.forEach((p, i) => {
  const cx = gridX + (p.c + 0.5) * cellW;
  const cy = gridY + (p.r + 0.5) * cellH;
  const r = Math.min(cellW, cellH) * p.size;
  const fillTop = p.color === "w" ? ACCENT2 : "#8a76e0";
  const fillBot = p.color === "w" ? WHITE_LIQ_DARK : BLACK_LIQ_DARK;
  const gid = `blobfill${i}`;
  blobsSvg += `
  <radialGradient id="${gid}" cx="35%" cy="30%" r="75%">
    <stop offset="0" stop-color="${fillTop}"/>
    <stop offset="1" stop-color="${fillBot}"/>
  </radialGradient>`;
  const path1 = blobPath(cx, cy, r, 1000 + i * 7);
  const path2 = blobPath(cx + r * 0.5, cy - r * 0.35, r * 0.42, 2000 + i * 11);
  glyphsSvg += `<path d="${path1}" fill="url(#${gid})"/>\n<path d="${path2}" fill="url(#${gid})"/>\n<text x="${cx.toFixed(1)}" y="${(cy + r * 0.34).toFixed(1)}" text-anchor="middle" font-family="JetBrains Mono" font-size="${(r * 1.15).toFixed(1)}" fill="${p.color === "w" ? WHITE_GLYPH : BLACK_GLYPH}">${p.glyph}</text>\n`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#0e3a44"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#1a2a52"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT2}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
    ${blobsSvg}
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="145" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="url(#title)">liquid chess</text>

  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">every piece is a droplet.</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="21" fill="${DIM}">it wobbles, flows across the</text>
  <text x="64" y="280" font-family="JetBrains Mono" font-size="21" fill="${DIM}">board, and <tspan fill="${ACCENT2}">dissolves</tspan> whatever</text>
  <text x="64" y="312" font-family="JetBrains Mono" font-size="21" fill="${DIM}">it captures.</text>

  <text x="64" y="374" font-family="JetBrains Mono" font-size="17" fill="${DIM}">capture the king outright to win —</text>
  <text x="64" y="400" font-family="JetBrains Mono" font-size="17" fill="${DIM}">liquid doesn't hold a shape for check.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">liquidchess.bisks.net</text>

  <!-- right: mini board card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${squaresSvg}
  ${glyphsSvg}
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

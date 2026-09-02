// Generates public/og.png — the Open Graph preview card for brewpaint.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/canvass, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#1e1f22", PANEL = "#2b2d31", BORDER = "#454851";
const FG = "#eceef0", DIM = "#9a9ea6", ACCENT = "#5aa9ff", ACCENT2 = "#ffb454";
const SWATCHES = ["#111111", "#ff0000", "#ff7f00", "#ffff00", "#00a020", "#00ffff", "#0060ff", "#a000ff", "#ff00ff", "#ffffff"];

const boxX = 700, boxY = 150, boxW = 440, boxH = 330;
const swatchSize = 34, swatchGap = 6;
const swatchesPerRow = 5;

let swatchSvg = "";
SWATCHES.forEach((hex, i) => {
  const row = Math.floor(i / swatchesPerRow);
  const col = i % swatchesPerRow;
  const x = boxX + 32 + col * (swatchSize + swatchGap);
  const y = boxY + 150 + row * (swatchSize + swatchGap);
  swatchSvg += `<rect x="${x}" y="${y}" width="${swatchSize}" height="${swatchSize}" rx="5" fill="${hex}" stroke="rgba(255,255,255,0.15)"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT2}">brew<tspan fill="${FG}">paint</tspan></text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a tiny Paint.NET tribute, right in your browser</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Brush, shapes, layers, undo/redo, bucket fill —</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">built in honor of Rick Brewer and Paint.NET,</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">for whoever tagged @buildthis next.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">brewpaint.bisks.net</text>

  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="18" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${boxX + 32}" y="${boxY + 56}" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="2" fill="${ACCENT}">TOOLBOX</text>
  <g stroke="${FG}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <line x1="${boxX + 32}" y1="${boxY + 108}" x2="${boxX + 56}" y2="${boxY + 84}"/>
    <rect x="${boxX + 76}" y="${boxY + 86}" width="26" height="20" rx="4"/>
    <rect x="${boxX + 118}" y="${boxY + 86}" width="26" height="20" rx="4"/>
    <ellipse cx="${boxX + 173}" cy="${boxY + 96}" rx="14" ry="10"/>
    <path d="M ${boxX + 200} ${boxY + 106} l 8 -22 h 12 l 8 22 a 14 10 0 0 1 -28 0 z"/>
  </g>
  ${swatchSvg}
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

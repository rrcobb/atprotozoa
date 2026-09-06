// Generates public/og.png — the Open Graph preview card for mootvent.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Copied from sites/didscope's
// og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060608", FG = "#eef0ff", DIM = "#8b8fae";
const ACCENT = "#ff2f7e", ACCENT2 = "#2fe2ff", ACCENT3 = "#fff23f", CARD = "#101018", BORDER = "#26263a";

// a fixed 6x4 grid of doors, a handful "opened" (glitch-bar thumbnails) to
// sell the idea at a glance without needing any live data.
const OPENED = new Set([1, 2, 3, 5, 8, 13]);
const PALETTE = [ACCENT, ACCENT2, ACCENT3, "#7cffb2", "#c04dff"];

function doorSvg(n, x, y, size) {
  const opened = OPENED.has(n);
  if (!opened) {
    return `<g>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
      <text x="${x + size / 2}" y="${y + size / 2 + 8}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${DIM}">${n}</text>
    </g>`;
  }
  const bars = [];
  const seed = n * 7919;
  for (let i = 0; i < 4; i++) {
    const bh = 4 + ((seed * (i + 3)) % (size * 0.22));
    const by = y + ((seed * (i + 5)) % (size - bh));
    const color = PALETTE[(n + i) % PALETTE.length];
    bars.push(`<rect x="${x}" y="${by}" width="${size}" height="${bh}" fill="${color}" opacity="0.85"/>`);
  }
  return `<g>
    <clipPath id="clip${n}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8"/></clipPath>
    <g clip-path="url(#clip${n})">
      <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#000"/>
      ${bars.join("\n      ")}
    </g>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="none" stroke="${ACCENT}" stroke-width="1.5"/>
    <text x="${x + size / 2}" y="${y + size / 2 + 8}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${FG}" opacity="0.95">${n}</text>
  </g>`;
}

const gridX = 640, gridY = 90, cols = 6, rows = 4, gap = 12;
const cellSize = (W - 60 - gridX - gap * (cols - 1)) / cols;
let doors = "";
let n = 1;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    doors += doorSvg(n, gridX + c * (cellSize + gap), gridY + r * (cellSize + gap), cellSize);
    n++;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a0b2e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0a2436"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="130" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">mootvent</text>
  <text x="60" y="180" font-family="JetBrains Mono" font-size="19" fill="${DIM}">24 doors. one a day.</text>
  <text x="60" y="208" font-family="JetBrains Mono" font-size="19" fill="${DIM}">behind each: a glitched photo</text>
  <text x="60" y="236" font-family="JetBrains Mono" font-size="19" fill="${DIM}">from one of your <tspan fill="${ACCENT2}">moots</tspan>,</text>
  <text x="60" y="264" font-family="JetBrains Mono" font-size="19" fill="${DIM}">or pure glitch art if not.</text>

  <text x="60" y="330" font-family="JetBrains Mono" font-size="16" fill="${DIM}">saved in <tspan fill="${ACCENT3}">localStorage</tspan> —</text>
  <text x="60" y="356" font-family="JetBrains Mono" font-size="16" fill="${DIM}">nothing leaves your browser.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">mootvent.bisks.net</text>

  ${doors}
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

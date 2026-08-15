// Generates public/og.png — the Open Graph preview card for annoyotron.
//
// A soundboard-grid graphic at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Recipe copied from sites/receipts/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const BG = "#120a1e", BG2 = "#1c0f2e";
const PANEL = "#1e1230", LINE = "#3a2757";
const INK = "#f4ecff", DIM = "#b6a4d9";
const HOT = "#ff3d81", HOT2 = "#ffb92e", CYAN = "#33e6cf";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pads = ["📯", "🥁", "😢", "🌀", "💿", "🎺", "🦆", "🎢", "🚲", "💰", "🐏", "🎻", "🦎", "💧", "🙅", "🔫"];
let padSvg = "";
const cols = 4, padW = 96, padH = 96, gap = 16;
const gridW = cols * padW + (cols - 1) * gap;
const startX = 60, startY = 130;
pads.forEach((emoji, i) => {
  const col = i % cols, row = Math.floor(i / cols);
  const x = startX + col * (padW + gap);
  const y = startY + row * (padH + gap);
  const accent = i % 5 === 0 ? HOT2 : i % 3 === 0 ? CYAN : HOT;
  padSvg += `
  <rect x="${x}" y="${y}" width="${padW}" height="${padH}" rx="16" fill="${PANEL}" stroke="${accent}" stroke-width="2" opacity="0.9"/>
  <text x="${x + padW / 2}" y="${y + padH / 2 + 14}" text-anchor="middle" font-size="40">${emoji}</text>`;
});

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${HOT}"/>
      <stop offset="0.5" stop-color="${HOT2}"/>
      <stop offset="1" stop-color="${CYAN}"/>
    </linearGradient>
    <radialGradient id="glow" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a1450" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${padSvg}

  <g>
    <text x="600" y="150" font-family="JetBrains Mono" font-weight="900" font-size="66" fill="url(#title)">ANNOYOTRON</text>
    <text x="602" y="195" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a soundboard of morning-zoo noises</text>
    <text x="602" y="226" font-family="JetBrains Mono" font-size="21" fill="${DIM}">for the Unnamed Simcluster Podcast</text>

    <rect x="600" y="270" width="540" height="2" fill="${LINE}"/>

    <text x="602" y="320" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">28 sounds. 8 from the Simcluster</text>
    <text x="602" y="348" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">Extended Universe: let it rip, the</text>
    <text x="602" y="376" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">Shofar of Moses, RISC with a C,</text>
    <text x="602" y="404" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">Animorphs goo, and more.</text>

    <text x="602" y="460" font-family="JetBrains Mono" font-size="17" fill="${HOT2}">no audio files. every honk is a</text>
    <text x="602" y="486" font-family="JetBrains Mono" font-size="17" fill="${HOT2}">Web Audio oscillator, synthesized live.</text>

    <text x="602" y="560" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${CYAN}">annoyotron.bisks.net</text>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [join(__dirname, "fonts/JetBrainsMono.ttf")],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log(`wrote public/og.png (${png.length} bytes)`);

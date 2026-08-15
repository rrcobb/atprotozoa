// Generates public/og.png — the Open Graph preview card for skullcouncil.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#14100f";
const PANEL = "#221b19";
const BORDER = "#3a2f2a";
const INK = "#ede2d4";
const DIM = "#a5978a";
const AMBER = "#e8a33d";
const GOLD = "#ffd75e";
const PASS = "#6ee7a0";
const FAIL = "#ff6b6b";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A small die, rasterised as a rounded square with pip dots. `n` in 1..6.
function die(x, y, size, n, fill, ink) {
  const pips = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]],
  }[n];
  const r = size * 0.055;
  const dots = pips
    .map(([px, py]) => `<circle cx="${x + px * size}" cy="${y + py * size}" r="${r}" fill="${ink}"/>`)
    .join("");
  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.16}" fill="${fill}" stroke="${BORDER}" stroke-width="2"/>
    ${dots}`;
}

// A simple skull silhouette, drawn from primitives (no emoji/icon font needed).
function skull(cx, cy, s) {
  return `
    <g>
      <ellipse cx="${cx}" cy="${cy}" rx="${s * 0.62}" ry="${s * 0.58}" fill="${INK}"/>
      <rect x="${cx - s * 0.4}" y="${cy + s * 0.25}" width="${s * 0.8}" height="${s * 0.42}" rx="${s * 0.12}" fill="${INK}"/>
      <ellipse cx="${cx - s * 0.26}" cy="${cy - s * 0.02}" rx="${s * 0.17}" ry="${s * 0.2}" fill="${BG}"/>
      <ellipse cx="${cx + s * 0.26}" cy="${cy - s * 0.02}" rx="${s * 0.17}" ry="${s * 0.2}" fill="${BG}"/>
      <polygon points="${cx},${cy + s * 0.16} ${cx - s * 0.07},${cy + s * 0.32} ${cx + s * 0.07},${cy + s * 0.32}" fill="${BG}"/>
      <rect x="${cx - s * 0.32}" y="${cy + s * 0.42}" width="${s * 0.11}" height="${s * 0.14}" fill="${BG}"/>
      <rect x="${cx - s * 0.13}" y="${cy + s * 0.42}" width="${s * 0.11}" height="${s * 0.14}" fill="${BG}"/>
      <rect x="${cx + s * 0.02}" y="${cy + s * 0.42}" width="${s * 0.11}" height="${s * 0.14}" fill="${BG}"/>
      <rect x="${cx + s * 0.21}" y="${cy + s * 0.42}" width="${s * 0.11}" height="${s * 0.14}" fill="${BG}"/>
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2a14"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="#12241c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  ${skull(150, 175, 150)}

  <text x="270" y="185" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${AMBER}" letter-spacing="2">SKULLCOUNCIL</text>
  <text x="272" y="230" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a bluesky client with no text box</text>

  <rect x="80" y="300" width="1040" height="2" fill="${BORDER}"/>

  <text x="80" y="370" font-family="JetBrains Mono" font-size="27" fill="${INK}">eight voices in your head. you pick one, and what it wants to say.</text>
  <text x="80" y="412" font-family="JetBrains Mono" font-size="27" fill="${INK}">roll 2d6 against its skill — fail, and that's still what gets posted.</text>

  ${die(80, 460, 92, 1, PANEL, FAIL)}
  ${die(190, 460, 92, 6, PANEL, PASS)}
  <text x="310" y="500" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">snake eyes fails hard. double sixes never misses.</text>

  <text x="80" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${GOLD}">skullcouncil.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");

// Generates public/og.png — the static Open Graph preview card. Hand-drawn
// SVG, rasterised with @resvg/resvg-js and skyclone's bundled JetBrains Mono
// font (no system Chromium/fontconfig needed). Same recipe as
// sites/speedhose/og-gen.mjs, sites/bangerwatch/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#050406", FG = "#f2eef4", DIM = "#96899e", CARD = "#0c0910", BORDER = "#241a2a";
const RED = "#ff3355", AMBER = "#ffb84d";

const FACTIONS = [
  { color: "#4df3ff" }, { color: "#ff4dd8" }, { color: "#4dff8f" }, { color: "#ffe14d" },
  { color: "#ff9a4d" }, { color: "#c08dff" }, { color: "#5b8bff" }, { color: "#ff3355" },
];

// deterministic pseudo-random tile grid so the same og.png renders every build
function rnd(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

const cols = 24, rows = 10, tile = 20, gx = 760, gy = 150;
let tiles = "";
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const r = rnd(x * 31 + y * 977 + 1);
    if (r < 0.18) continue; // leave some cells neutral
    const f = FACTIONS[Math.floor(r * 97) % FACTIONS.length];
    tiles += `<rect x="${gx + x * tile}" y="${gy + y * tile}" width="${tile - 1}" height="${tile - 1}" fill="${f.color}" opacity="${0.55 + rnd(x + y * 13) * 0.4}"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="0%" r="60%">
      <stop offset="0" stop-color="#2a0a12"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${RED}"/>
      <stop offset="0.7" stop-color="${AMBER}"/>
      <stop offset="1" stop-color="#fff2c2"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="900" font-size="66" fill="url(#title)">turfwar</text>
  <text x="66" y="160" font-family="JetBrains Mono" font-size="20" fill="${DIM}">a live language turf war off the bluesky firehose</text>

  <rect x="${gx - 20}" y="${gy - 20}" width="${cols * tile + 20}" height="${rows * tile + 20}" rx="12" fill="${CARD}" stroke="${BORDER}"/>
  ${tiles}

  <text x="64" y="240" font-family="JetBrains Mono" font-size="18" fill="${DIM}">every real post is a strike for its</text>
  <text x="64" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">language's faction on a 576-cell map.</text>
  <text x="64" y="330" font-family="JetBrains Mono" font-size="18" fill="${FG}" font-weight="700">claim it neutral. seize it enemy-held.</text>
  <text x="64" y="358" font-family="JetBrains Mono" font-size="18" fill="${FG}" font-weight="700">it never stops.</text>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RED}">turfwar.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

// Generates public/og.png — the Open Graph preview card for belvedere.
// A Penrose (impossible) triangle over a scattered field of small colored
// dots, echoing the live page's tessellated dot-field of surveyed sites.
//
//   node og-gen.mjs   # writes ./public/og.png
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PAPER = "#ece7da", INK = "#17161c", DIM = "#6b6558", CARD = "#f7f4ea";
const MONO = "JetBrains Mono";
const SERIF = "DejaVu Serif";

const DOT_COLORS = [
  "#d9a441", "#c2477a", "#2fa3ad", "#3f6fd1", "#4e9b5c",
  "#8a9c3a", "#7cb896", "#8c6bd6", "#a98cd6", "#d67e3f", "#b7b0a0",
];

// Deterministic pseudo-random so the output is stable across regenerations.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260825);

let dots = "";
const rows = 10, cols = 26;
const gridTop = 470, gridLeft = 60, cellW = (W - 120) / cols, cellH = 14;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    if (rand() < 0.18) continue; // sparse field, not a solid block
    const x = gridLeft + c * cellW + (rand() * 4 - 2);
    const y = gridTop + r * cellH + (rand() * 4 - 2);
    const color = DOT_COLORS[Math.floor(rand() * DOT_COLORS.length)];
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2" fill="${color}" opacity="0.9"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="${CARD}" stroke="#b9b09a" stroke-width="2"/>

  <g transform="translate(590,60) scale(2.1)">
    <path d="M50 4 L94 80 L72 80 L50 42 L28 80 L6 80 Z" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M50 4 L28 80 L44 80 L58 55" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M94 80 L58 55 L44 80" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" opacity="0.5"/>
    <path d="M6 80 L50 42 L58 55" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" opacity="0.5"/>
  </g>

  <text x="600" y="290" text-anchor="middle" font-family="${MONO}" font-weight="bold" font-size="66" fill="${INK}">belvedere</text>
  <text x="600" y="335" text-anchor="middle" font-family="${SERIF}" font-size="24" fill="${DIM}">an atproto tool census for every site in the constellation</text>
  <text x="600" y="368" text-anchor="middle" font-family="${MONO}" font-size="18" fill="${DIM}">OAuth · Jetstream · bulk repo reads · AppView calls · plain fields — one dot per site</text>

  ${dots}

  <text x="600" y="588" text-anchor="middle" font-family="${MONO}" font-weight="bold" font-size="24" fill="${INK}">belvedere.bisks.net</text>
</svg>`;

const fontPaths = [
  fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url)),
];
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: MONO },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out);

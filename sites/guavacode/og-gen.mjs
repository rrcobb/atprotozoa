// Generates public/og.png — the Open Graph preview card for guavacode.
// Hand-drawn SVG rasterised with @resvg/resvg-js (same recipe as
// sites/humanbench/og-gen.mjs).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// The example rows are real counts from a full scan of assembly
// GCA_016432845.1 run with public/lib/engine.js (a few tiny unplaced scaffolds
// were rate-limited out of that run, so the numbers are shown as lower bounds).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0e0a0c", FG = "#f6ecef", DIM = "#a8909a", PINK = "#ff8fa3", GREEN = "#9be58a", CARD = "#171115", BORDER = "#3a2a33";

const rows = [
  ["↑↑↓↓←→←→BA", "2-bit text", "0"],
  ["Rob", "2-bit text", "69+"],
  ["GATTACA", "ACGT letters", "50,000+"],
  ["LIFE", "protein", "34,000+"],
];
const cardX = 560, cardY = 70, cardW = 580, cardH = 490;
const rowsSvg = rows.map(([term, mode, n], i) => {
  const y = cardY + 120 + i * 96;
  const color = n === "0" ? PINK : GREEN;
  return `<text x="${cardX + 36}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${FG}">${term}</text>
  <text x="${cardX + 36}" y="${y + 28}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">${mode}</text>
  <text x="${cardX + cardW - 36}" y="${y + 8}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="36" fill="${color}">${n}</text>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${PINK}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient>
    <radialGradient id="g1" cx="10%" cy="-10%" r="60%"><stop offset="0" stop-color="#3a1522"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">guavacode</text>
  <text x="64" y="206" font-family="JetBrains Mono" font-size="22" fill="${DIM}">how many times is it encoded</text>
  <text x="64" y="236" font-family="JetBrains Mono" font-size="22" fill="${DIM}">in the guava genome?</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="17" fill="${DIM}">443 million bases, streamed from</text>
  <text x="64" y="346" font-family="JetBrains Mono" font-size="17" fill="${DIM}">NCBI into your browser. both strands,</text>
  <text x="64" y="372" font-family="JetBrains Mono" font-size="17" fill="${DIM}">three encodings, any word.</text>
  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${PINK}">guavacode.bisks.net</text>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 36}" y="${cardY + 48}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">HITS IN THE GENOME</text>
  ${rowsSvg}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } });
const png = r.render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url).pathname, png);
console.log("wrote og.png", png.length, "bytes");

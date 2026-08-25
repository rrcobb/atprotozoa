// Generates public/og.png — the Open Graph preview card for graycart.
// Same recipe as sites/didscope/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed, and
// this box has no fontconfig either — the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// The card mocks up a sample cartridge screen (hand-picked pixels, not a
// live capture — every real visit generates something different).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#100f0d";
const PLASTIC = "#d8d5cc";
const PLASTIC_DK = "#b9b6ac";
const DIM = "#86837a";
const RED = "#8a2e2e";

// A little hand-authored 16x14 scene in 4 grayscale shades (0=bg .. 3=lightest)
// standing in for "a cartridge" — a maze corridor with a wanderer and a goal.
const SHADES = ["#1c1c1c", "#4d4d4d", "#a6a6a6", "#f5f5f5"];
// prettier-ignore
const SCENE = [
  "0000000000000000",
  "0111111100000000",
  "0100000100000000",
  "0100011111111000",
  "0100010000001000",
  "0111110222001000",
  "0000010000001000",
  "0000011111101000",
  "0000000000101000",
  "0333000000101000",
  "0330000011111000",
  "0333000010000000",
  "0000000010000000",
  "0000000000000000",
];

const cell = 16;
const sceneX = 96,
  sceneY = 96;
const sceneW = SCENE[0].length * cell,
  sceneH = SCENE.length * cell;

let pixels = "";
for (let y = 0; y < SCENE.length; y++) {
  for (let x = 0; x < SCENE[y].length; x++) {
    const role = Number(SCENE[y][x]);
    if (!role) continue;
    pixels += `<rect x="${sceneX + x * cell}" y="${sceneY + y * cell}" width="${cell}" height="${cell}" fill="${SHADES[role]}"/>\n`;
  }
}

const screenX = sceneX - 40,
  screenY = sceneY - 40,
  screenW = sceneW + 80,
  screenH = sceneH + 80;
const deviceX = screenX - 46,
  deviceY = screenY - 46,
  deviceW = screenW + 92,
  deviceH = screenH + 180;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- device -->
  <rect x="${deviceX}" y="${deviceY}" width="${deviceW}" height="${deviceH}" rx="30" fill="${PLASTIC}"/>
  <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="10" fill="#26251f"/>
  <rect x="${sceneX - 6}" y="${sceneY - 6}" width="${sceneW + 12}" height="${sceneH + 12}" fill="${SHADES[0]}"/>
  ${pixels}
  <circle cx="${deviceX + deviceW - 120}" cy="${deviceY + deviceH - 90}" r="30" fill="${RED}"/>
  <circle cx="${deviceX + deviceW - 190}" cy="${deviceY + deviceH - 62}" r="30" fill="${RED}"/>
  <rect x="${deviceX + 70}" y="${deviceY + deviceH - 110}" width="70" height="24" rx="4" fill="${PLASTIC_DK}"/>
  <rect x="${deviceX + 88}" y="${deviceY + deviceH - 128}" width="34" height="60" rx="4" fill="${PLASTIC_DK}"/>

  <!-- wordmark -->
  <text x="${deviceX + deviceW + 60}" y="260" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="#f5f5f5">graycart</text>
  <text x="${deviceX + deviceW + 60}" y="316" font-family="JetBrains Mono" font-size="24" fill="${DIM}">160×144, four shades of gray.</text>
  <text x="${deviceX + deviceW + 60}" y="352" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a new cartridge every visit —</text>
  <text x="${deviceX + deviceW + 60}" y="388" font-family="JetBrains Mono" font-size="24" fill="${DIM}">nobody tells you the rules.</text>
  <text x="${deviceX + deviceW + 60}" y="460" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#c9c5b8">graycart.bisks.net</text>
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

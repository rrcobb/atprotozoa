// Generates public/og.png — the static Open Graph preview card for dibs,
// so a bare link (no phrase) still unfurls as something real. Hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no fontconfig/
// system fonts either, so the font is bundled in ./fonts and loaded
// explicitly). Same recipe as sites/patientzero/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (no real phrase/handle) — per-phrase real cards are
// drawn live, client-side, on canvas (see public/app.js buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#0b0d10";
const FG = "#f2f4f6";
const DIM = "#8d97a3";
const GOLD = "#f2c14e";
const PANEL = "#14171c";
const BORDER = "#262b33";

const cardX = 630,
  cardY = 130,
  cardW = 500,
  cardH = 380;

const card = `
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${PANEL}" stroke="${BORDER}" stroke-width="2"/>
  <circle cx="${cardX + 66}" cy="${cardY + 60}" r="26" fill="#1b1f26" stroke="${GOLD}" stroke-width="2"/>
  <rect x="${cardX + 106}" y="${cardY + 40}" width="180" height="16" rx="6" fill="#3a3844"/>
  <rect x="${cardX + 106}" y="${cardY + 64}" width="120" height="12" rx="5" fill="#232028"/>
  <rect x="${cardX + 36}" y="${cardY + 108}" width="4" height="60" fill="${GOLD}"/>
  <rect x="${cardX + 56}" y="${cardY + 112}" width="${cardW - 100}" height="14" rx="6" fill="#232028"/>
  <rect x="${cardX + 56}" y="${cardY + 136}" width="${cardW - 160}" height="14" rx="6" fill="#232028"/>
  <text x="${cardX + 40}" y="${cardY + cardH - 30}" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${DIM}">FIRST SPOTTED</text>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <defs>
    <radialGradient id="glow" cx="50%" cy="-10%" r="60%">
      <stop offset="0%" stop-color="#3a2f10"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="90" fill="${GOLD}">dibs</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${DIM}">who said it first?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Type a phrase, it pages Bluesky</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="19" fill="${DIM}">search all the way back to find</text>
  <text x="64" y="350" font-family="JetBrains Mono" font-size="19" fill="${DIM}">whoever said it first.</text>

  <text x="64" y="420" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">dibs.bisks.net</text>

  ${card}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
});
const png = resvg.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");

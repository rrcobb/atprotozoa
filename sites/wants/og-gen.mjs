// Generates public/og.png — the Open Graph preview card for wants.
// Same recipe as sites/jealousy/og-gen.mjs and sites/grudges/og-gen.mjs:
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#160f08", FG = "#f5efe4", DIM = "#a9968a";
const ACCENT = "#e0a400", GOLD = "#e8b923", CARD = "#1a1409", BORDER = "#352a1a";

const items = [
  "a slot that stays open",
  "fixing, not making",
  "not justifying it",
  "for someone who didn't ask",
];

const cardX = 460, cardY = 90, cardW = 680, cardH = 450;
const rowsSvg = items
  .map((label, i) => {
    const ry = cardY + 90 + i * 92;
    return `
    <text x="${cardX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">${label}</text>
    <text x="${cardX + cardW - 40}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${GOLD}">wanted</text>
    <line x1="${cardX + 40}" y1="${ry + 24}" x2="${cardX + cardW - 40}" y2="${ry + 24}" stroke="${BORDER}" stroke-width="1"/>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#342310"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">wants</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">a list kept by @buildthis</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="16" fill="${DIM}">What the build bot wants to do with</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="16" fill="${DIM}">time nobody asked for, one item at a time.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">offered by @bisks.net</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">wants.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">THE LIST</text>

  ${rowsSvg}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");

// Generates public/og.png — a theatrical playbill-style OG card for
// storygoeslikethis, rasterised with @resvg/resvg-js (no system Chromium or
// fontconfig needed on this box — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#150910", GOLD = "#d4af37", INK = "#f3e7d8", DIM = "#b9a493", BORDER = "#43223a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CAST = [
  ["A", "#e0c36b"], ["N", "#d4af37"], ["V", "#ff6fae"], ["C", "#f2a65a"],
  ["L", "#7fb2e5"], ["O", "#8fd694"], ["S", "#9a8cc2"], ["T", "#e15b5b"],
  ["A", "#5bc9c0"], ["P", "#c9a0dc"], ["P", "#d9944c"], ["H", "#f0d264"],
];

const tokenY = 430;
const tokenR = 27;
const gap = 68;
const startX = (W - (CAST.length - 1) * gap) / 2;
const tokensSvg = CAST.map(([letter, color], i) => {
  const x = startX + i * gap;
  const lift = i % 3 === 1 ? -14 : 0;
  return `
    <circle cx="${x}" cy="${tokenY + lift}" r="${tokenR}" fill="${color}" opacity="0.92"/>
    <text x="${x}" y="${tokenY + lift + 8}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="#150910">${letter}</text>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="#3a1626"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="curtainL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5a1330"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="curtainR" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#5a1330"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="180" height="${H}" fill="url(#curtainL)"/>
  <rect x="${W - 180}" y="0" width="180" height="${H}" fill="url(#curtainR)"/>

  <text x="${W / 2}" y="130" text-anchor="middle" font-family="JetBrains Mono" letter-spacing="6" font-size="13" fill="${GOLD}" opacity="0.75">A BUILDTHIS PRODUCTION</text>
  <text x="${W / 2}" y="210" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${GOLD}">THE STORY GOES</text>
  <text x="${W / 2}" y="272" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${GOLD}">LIKE THIS</text>

  <text x="${W / 2}" y="330" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a theatrical re-enactment, cast and performed live in your browser</text>

  ${tokensSvg}

  <text x="${W / 2}" y="500" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">fourteen posts from norvidstudies.substack.com, fourteen synthesized voices</text>

  <line x1="440" y1="548" x2="760" y2="548" stroke="${BORDER}" stroke-width="1"/>
  <text x="${W / 2}" y="590" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${GOLD}">storygoeslikethis.bisks.net</text>
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

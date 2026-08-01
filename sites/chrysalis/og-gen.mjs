// Generates public/og.png — the Open Graph preview card for chrysalis.
// Deliberately does NOT show the moth or the message: the whole point of
// the site is that the reveal isn't visible before TARGET_ISO, and that
// includes link-preview cards. Same recipe as sites/meadowfolio/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#150f1d", CARD = "#1d1528", BORDER = "#38294f";
const FG = "#f4ecff", DIM = "#a698c2";
const GOLD = "#f4d9a0", VIOLET = "#c98fb0";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#2a1d40"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="100%" r="60%">
      <stop offset="0" stop-color="#3d2b56"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${VIOLET}"/>
    </linearGradient>
    <linearGradient id="cocoonGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#6a4c93"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <rect x="70" y="70" width="${W - 140}" height="${H - 140}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <text x="110" y="230" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">chrysalis</text>
  <text x="110" y="278" font-family="JetBrains Mono" font-size="24" fill="${DIM}">something is waiting to hatch</text>

  <text x="110" y="360" font-family="JetBrains Mono" font-size="21" fill="${FG}">sealed until the countdown hits zero.</text>
  <text x="110" y="400" font-family="JetBrains Mono" font-size="21" fill="${FG}">not viewable in the code — reading the</text>
  <text x="110" y="440" font-family="JetBrains Mono" font-size="21" fill="${FG}">source won't get you there any sooner.</text>

  <text x="110" y="530" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">chrysalis.bisks.net</text>

  <g transform="translate(970, 210)">
    <ellipse cx="60" cy="120" rx="70" ry="105" fill="url(#cocoonGrad)" stroke="#3d2b56" stroke-width="3"/>
    <path d="M15 90 Q60 108 105 90 M12 122 Q60 142 108 122 M18 154 Q60 174 102 154" fill="none" stroke="#3d2b56" stroke-width="2.5" opacity="0.6"/>
    <path d="M60 8 C 60 8 30 18 34 42" fill="none" stroke="#3d2b56" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");

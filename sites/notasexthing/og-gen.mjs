// Generates public/og.png — the Open Graph preview card for notasexthing.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   NODE_PATH=../receipts/node_modules node og-gen.mjs   # writes ./public/og.png
//   (or `npm install @resvg/resvg-js --no-save` here first, if that dir moves)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0b10", BG2 = "#121018", FG = "#f4eef8", DIM = "#a79bb8";
const PINK = "#ff7ad1", GOLD = "#ffd166";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="65%">
      <stop offset="0" stop-color="#3a1030"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="60%">
      <stop offset="0" stop-color="#1a2440"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">a directory of every post</text>
  <text x="64" y="206" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">that ends in</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">&#8220;it's not a sex thing&#8221;</text>

  <rect x="60" y="340" width="700" height="2" fill="${BG2}" stroke="${DIM}" stroke-width="1" opacity="0.5"/>

  <text x="64" y="404" font-family="JetBrains Mono" font-size="21" fill="${DIM}">punctuation ignored. compiled live</text>
  <text x="64" y="434" font-family="JetBrains Mono" font-size="21" fill="${DIM}">from Bluesky's public search index.</text>

  <text x="64" y="500" font-family="JetBrains Mono" font-size="18" fill="${DIM}">"...exploring every object's POV in</text>
  <text x="64" y="526" font-family="JetBrains Mono" font-size="18" fill="${DIM}">image generators it's not a sex thing!!"</text>
  <text x="64" y="552" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${GOLD}">— @cee.wtf, the post that started it</text>

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${PINK}">notasexthing.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png", png.length, "bytes");

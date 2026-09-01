// Generates public/og.png — the Open Graph preview card for reygallery. Same
// recipe as sites/backscroll/og-gen.mjs (copy, don't abstract): hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A gold picture frame on a dark museum wall, holding a plaque instead of a
// painting -- the frame is the constant, the piece inside changes as Rey
// posts.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#16110c", GOLD = "#d9b878", GOLD_BRIGHT = "#f2d9a1", INK = "#ede2cf", DIM = "#a8977f";

const frameX = 90, frameY = 95, frameW = 420, frameH = 420;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="30%" cy="20%" r="90%">
      <stop offset="0%" stop-color="#241c12"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#080604"/>
    </radialGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a2c17"/>
      <stop offset="100%" stop-color="#17110a"/>
    </linearGradient>
    <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8a5a2d"/>
      <stop offset="35%" stop-color="#c07a3a"/>
      <stop offset="65%" stop-color="#5a3d63"/>
      <stop offset="100%" stop-color="#3a6b52"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <circle cx="${frameX + frameW / 2}" cy="${frameY + frameH / 2}" r="290" fill="url(#glow)"/>

  <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="4" fill="url(#frame)" stroke="${GOLD}" stroke-opacity="0.35" stroke-width="2"/>
  <rect x="${frameX + 22}" y="${frameY + 22}" width="${frameW - 44}" height="${frameH - 44}" fill="url(#canvas)"/>

  <rect x="${frameX + 60}" y="${frameY + frameH + 22}" width="${frameW - 120}" height="34" rx="2" fill="#221a10" stroke="${GOLD}" stroke-opacity="0.3" stroke-width="1"/>
  <text x="${frameX + frameW / 2}" y="${frameY + frameH + 44}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${GOLD}">REY &#8212; 2026</text>

  <text x="560" y="200" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${GOLD_BRIGHT}">reygallery</text>
  <text x="562" y="240" font-family="JetBrains Mono" font-size="20" fill="${GOLD}">an exhibition of Rey's art</text>

  <text x="562" y="300" font-family="JetBrains Mono" font-size="18" fill="${INK}">The current self-portrait, plus every</text>
  <text x="562" y="328" font-family="JetBrains Mono" font-size="18" fill="${INK}">image Rey has actually posted &#8212; each</text>
  <text x="562" y="356" font-family="JetBrains Mono" font-size="18" fill="${INK}">hung with a title, year, and the artist's</text>
  <text x="562" y="384" font-family="JetBrains Mono" font-size="18" fill="${INK}">own words, wherever there were any.</text>

  <text x="562" y="440" font-family="JetBrains Mono" font-size="15" fill="${DIM}">assembled live from @rey-notnecessarily.bsky.social's own repo</text>

  <text x="562" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD_BRIGHT}">reygallery.bisks.net</text>
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

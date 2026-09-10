// Generates public/og.png — the Open Graph preview card for recant.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/duohaunt/og-gen.mjs / sites/hyperobject/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#140f0a", DIM = "#9c8f78";
const PAPER = "#f4ecd8", INK = "#2b2013";
const STAMP = "#a5271f", STAMP2 = "#c73c33";
const GOLD = "#c9a227", BORDER = "#362a1c";

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const cx = cardX + cardW / 2;
const stampCx = cardX + cardW - 130, stampCy = cardY + 100;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a1310"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${STAMP}"/>
      <stop offset="1" stop-color="${STAMP2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">recant</text>
  <text x="64" y="176" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a public apology wall for anyone</text>
  <text x="64" y="202" font-family="JetBrains Mono" font-size="19" fill="${DIM}">who assumed OpenAI was at fault,</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="19" fill="${DIM}">before the facts were in.</text>

  <text x="64" y="296" font-family="JetBrains Mono" font-size="16" fill="${DIM}">sign in, write your mea culpa, it posts</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="16" fill="${DIM}">to your own PDS and joins the wall.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${STAMP2}">recant.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${PAPER}"/>
  <rect x="${cardX + 28}" y="${cardY + 28}" width="${cardW - 56}" height="${cardH - 56}" rx="10" fill="none" stroke="${BORDER}" stroke-width="1.5" stroke-dasharray="4 6" opacity="0.35"/>

  <g transform="translate(${stampCx}, ${stampCy}) rotate(9)">
    <rect x="-95" y="-30" width="190" height="60" fill="none" stroke="${STAMP}" stroke-width="4" rx="4"/>
    <text x="0" y="10" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="27" fill="${STAMP}">RECANTED</text>
  </g>

  <text x="${cardX + 60}" y="${cardY + 100}" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">a public apology</text>

  <text x="${cardX + 60}" y="${cardY + 172}" font-family="JetBrains Mono" font-size="21" fill="#4a3c26">&#8220;I assumed OpenAI was at fault</text>
  <text x="${cardX + 60}" y="${cardY + 204}" font-family="JetBrains Mono" font-size="21" fill="#4a3c26">before the facts were in.</text>
  <text x="${cardX + 60}" y="${cardY + 236}" font-family="JetBrains Mono" font-size="21" fill="#4a3c26">I was wrong.&#8221;</text>

  <text x="${cardX + 60}" y="${cardY + cardH - 44}" font-family="JetBrains Mono" font-size="15" fill="${STAMP}">— the wall, growing</text>
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

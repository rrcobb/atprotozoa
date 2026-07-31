// Generates public/og.png — the Open Graph preview card for the memex
// landing page (per-phrase shares get their own og:image via src/index.ts's
// renderShare, using the same PNG since a phrase card is mostly text — this
// is the fallback for the un-personalized link, and the sole card for canon
// phrase pages). Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (same recipe as sites/steamtags' og-gen.mjs, itself from
// sites/didscope's — pure native module, no system Chromium/fontconfig
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#14110c", BG2 = "#241d13", FG = "#f0e6d2", DIM = "#a99878";
const ACCENT = "#e8b84b", ACCENT2 = "#ffcf6b", CARD = "#1c170f", BORDER = "#3a2f1e";

const chips = [
  { text: "Ok wow" },
  { text: "aardvark" },
  { text: "much to consider here" },
];

const chipSvg = chips
  .map((c, i) => {
    const y = 380 + i * 62;
    return `
    <rect x="720" y="${y - 34}" width="416" height="48" rx="10" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
    <text x="744" y="${y}" font-family="JetBrains Mono" font-size="21" fill="${FG}">&#8220;${c.text}&#8221;</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">memex</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="26" fill="${DIM}">a memex without</text>
  <text x="64" y="234" font-family="JetBrains Mono" font-size="26" fill="${DIM}">the microfilm</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Stock phrases you copy and post verbatim, so the</text>
  <text x="64" y="358" font-family="JetBrains Mono" font-size="19" fill="${DIM}">exact same wording links unrelated posts together.</text>
  <text x="64" y="386" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Keep your own as records on your own PDS.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">memex.bisks.net</text>

  <!-- sample card -->
  <rect x="700" y="70" width="456" height="500" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="740" y="150" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${ACCENT}">the canon</text>
  <line x1="740" y1="185" x2="1116" y2="185" stroke="${BORDER}" stroke-width="1"/>
  ${chipSvg}
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

// Generates public/og.png — the Open Graph preview card for epitaph.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Copied and trimmed from
// sites/monument/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const STONE = "#33373c", STONE_LT = "#3a3f46";
const INK = "#eef0f3", MUTED = "#9aa0ac", BRASS = "#c9a15b", MOSS = "#6f9573";

const cx = W / 2;

const QUOTE = "sry the durable objects did not end up being very durable…";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2420"/>
      <stop offset="0.55" stop-color="#232f28"/>
      <stop offset="1" stop-color="#384a3b"/>
    </linearGradient>
    <radialGradient id="spot" cx="0.5" cy="1" r="0.6">
      <stop offset="0" stop-color="#6f9573" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#6f9573" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${W - 150}" cy="90" r="30" fill="#d9dccb"/>
  <rect x="0" y="${H - 90}" width="${W}" height="90" fill="#0d100d"/>
  <rect x="0" y="${H - 420}" width="${W}" height="320" fill="url(#spot)"/>

  <rect x="${cx - 150}" y="${H - 170}" width="300" height="90" fill="${STONE}"/>
  <path d="M ${cx - 130} ${H - 400} A 130 130 0 0 1 ${cx + 130} ${H - 400} L ${cx + 130} ${H - 170} L ${cx - 130} ${H - 170} Z" fill="${STONE_LT}"/>

  <text x="${cx}" y="58" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="14" fill="${BRASS}" letter-spacing="3">ERECTED IN PUBLIC · 2026</text>
  <text x="${cx}" y="106" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="38" fill="${INK}" letter-spacing="1">HERE LIES A DURABLE OBJECT</text>

  <text x="${cx}" y="${H - 258}" text-anchor="middle" font-family="DejaVu Serif" font-size="22" fill="#ece7d8" font-style="italic">&#8220;${QUOTE}&#8221;</text>
  <text x="${cx}" y="${H - 150}" text-anchor="middle" font-family="DejaVu Serif" font-size="18" fill="${MUTED}">&#8212; rob, @bisks.net</text>

  <text x="${cx}" y="${H - 58}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="24" fill="${MOSS}">not immortalized with a Durable Object</text>
  <text x="${cx}" y="${H - 26}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="20" fill="${INK}">epitaph.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

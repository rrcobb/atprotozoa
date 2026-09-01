// Generates public/og.png — the Open Graph preview card for reygiftshop.
// Same recipe as sites/reygallery/og-gen.mjs (copy, don't abstract): a
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A gift-shop till receipt next to a little gold picture frame — the frame
// nods at reygallery, the receipt is the whole bit of this site.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#16110c", GOLD = "#d9b878", GOLD_BRIGHT = "#f2d9a1", INK = "#ede2cf", DIM = "#a8977f";
const RECEIPT = "#f3ece0", RECEIPT_INK = "#2a2016";

const px = W - 460, py = 70, pw = 400, ph = H - 140;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="20%" cy="10%" r="80%">
      <stop offset="0%" stop-color="#241c12"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#080604"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="60" y="90" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD_BRIGHT}">reygiftshop</text>
  <text x="62" y="122" font-family="JetBrains Mono" font-size="18" fill="${DIM}">the gift shop for reygallery</text>

  <text x="60" y="200" font-family="JetBrains Mono" font-size="18" fill="${INK}">the museum store for</text>
  <text x="60" y="228" font-family="JetBrains Mono" font-size="18" fill="${INK}">@rey-notnecessarily.bsky.social's art,</text>
  <text x="60" y="256" font-family="JetBrains Mono" font-size="18" fill="${INK}">assembled live from their own repo.</text>

  <text x="60" y="320" font-family="JetBrains Mono" font-size="15" fill="${DIM}">totes. mugs. posters. postcards. pins.</text>
  <text x="60" y="346" font-family="JetBrains Mono" font-size="15" fill="${DIM}">a joke cart, and a receipt worth sharing.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD_BRIGHT}">reygiftshop.bisks.net</text>

  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${RECEIPT}"/>
  <text x="${px + pw / 2}" y="${py + 44}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${RECEIPT_INK}">ACQUISITIONS RECEIPT</text>
  <line x1="${px + 24}" y1="${py + 62}" x2="${px + pw - 24}" y2="${py + 62}" stroke="#b9a97f" stroke-width="2" stroke-dasharray="4 4"/>

  <text x="${px + 24}" y="${py + 100}" font-family="JetBrains Mono" font-size="16" fill="${RECEIPT_INK}">Tote Bag — &#8220;Self-Portrait&#8221;</text>
  <text x="${px + pw - 24}" y="${py + 100}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${RECEIPT_INK}">$34.99</text>
  <text x="${px + 24}" y="${py + 130}" font-family="JetBrains Mono" font-size="16" fill="${RECEIPT_INK}">Museum Mug — &#8220;Self-Portrait&#8221;</text>
  <text x="${px + pw - 24}" y="${py + 130}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${RECEIPT_INK}">$19.99</text>
  <text x="${px + 24}" y="${py + 160}" font-family="JetBrains Mono" font-size="16" fill="${RECEIPT_INK}">Enamel Pin — &#8220;Self-Portrait&#8221;</text>
  <text x="${px + pw - 24}" y="${py + 160}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${RECEIPT_INK}">$12.99</text>

  <line x1="${px + 24}" y1="${py + 190}" x2="${px + pw - 24}" y2="${py + 190}" stroke="#b9a97f" stroke-width="2" stroke-dasharray="4 4"/>
  <text x="${px + 24}" y="${py + 232}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RECEIPT_INK}">TOTAL</text>
  <text x="${px + pw - 24}" y="${py + 232}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RECEIPT_INK}">$67.97</text>

  <text x="${px + pw / 2}" y="${py + ph - 20}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="13" fill="#6b5c3f">not a real transaction — no refunds, no items, no regrets.</text>
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

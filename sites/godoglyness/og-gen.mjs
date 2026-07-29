// Generates public/og.png — the Open Graph preview card for the godoglyness
// archive. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (no system fonts on this box — the font is bundled in
// ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. See sites/wikifix/og-gen.mjs for the reference.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0d10", CARD = "#14171c", BORDER = "#262b33";
const FG = "#e6e6e0", DIM = "#8b93a1", ACCENT = "#7dd3c0";

const cardX = 60, cardY = 210, cardW = W - 120, cardH = H - 280;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="12%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1a2a26"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="105" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">the <tspan fill="${ACCENT}">godoglyness</tspan> archive</text>
  <text x="60" y="145" font-family="JetBrains Mono" font-size="19" fill="${DIM}">every post, rebuilt as a tiny website, in order</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + 40}" y="${cardY + 62}" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="2" fill="${DIM}">#001 · NOV 5 2024 · 05:55 UTC</text>
  <text x="${cardX + 40}" y="${cardY + 130}" font-family="Georgia, serif" font-size="34" fill="${FG}">"feels quieter in here.</text>
  <text x="${cardX + 40}" y="${cardY + 178}" font-family="Georgia, serif" font-size="34" fill="${FG}">like i just walked into</text>
  <text x="${cardX + 40}" y="${cardY + 226}" font-family="Georgia, serif" font-size="34" fill="${FG}">the library"</text>

  <text x="${cardX + 40}" y="${cardY + cardH - 34}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">starting from post one · 18,323 to go</text>

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/godoglyness</text>
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

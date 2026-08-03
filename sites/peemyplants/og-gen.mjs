// Generates public/og.png — the static Open Graph preview card for
// peemyplants. Hand-drawn SVG, rasterised with @resvg/resvg-js and skyclone's
// bundled JetBrains Mono font (no system Chromium/fontconfig needed). Same
// recipe as sites/fieldguide/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#f3f7ee", INK = "#182412", MUTED = "#5c6b53", ACCENT = "#4a7a1e", PEE = "#d9a441";

function drop(cx, cy, s, fill) {
  return `<path d="M ${cx} ${cy - s} C ${cx + s} ${cy - s * 0.2}, ${cx + s} ${cy + s * 0.6}, ${cx} ${cy + s} C ${cx - s} ${cy + s * 0.6}, ${cx - s} ${cy - s * 0.2}, ${cx} ${cy - s} Z" fill="${fill}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  ${drop(1080, 120, 34, PEE)}
  ${drop(1000, 220, 20, ACCENT)}
  ${drop(1140, 260, 18, ACCENT)}

  <text x="64" y="230" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">peemyplants</text>
  <text x="64" y="284" font-family="JetBrains Mono" font-size="26" fill="${MUTED}">free fertilizer, delivered on foot</text>

  <line x1="64" y1="330" x2="${W - 64}" y2="330" stroke="${MUTED}" stroke-width="2" opacity="0.4"/>

  <text x="64" y="390" font-family="JetBrains Mono" font-size="22" fill="${INK}">a map of gardens that need it,</text>
  <text x="64" y="426" font-family="JetBrains Mono" font-size="22" fill="${INK}">for people who happen to have it.</text>
  <text x="64" y="470" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">no real addresses — every pin you drop stays in your own browser.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">peemyplants.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

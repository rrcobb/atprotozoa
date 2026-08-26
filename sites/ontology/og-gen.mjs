// Generates public/og.png — the static Open Graph preview card for
// ontology.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/fieldguide/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const eras = [
  ["usenet", "c. 1980"],
  ["phpBB", "c. 1995"],
  ["livejournal", "c. 1999"],
  ["the graph", "c. 2003"],
  ["twitter", "c. 2006"],
  ["the feed", "c. 2012"],
  ["atproto", "c. 2023"],
];

function tick(x, y, w, label, year) {
  return `
  <g>
    <line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${FAINT}" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="5" fill="${ACCENT}"/>
    <text x="${x}" y="${y + 30}" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">${label}</text>
    <text x="${x}" y="${y + 52}" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">${year}</text>
  </g>`;
}

const colW = (W - 128) / eras.length;
const ticks = eras
  .map(([label, year], i) => tick(64 + i * colW, 340, colW - 16, label, year))
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="108" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">ontology</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a short history of what a "friend" even is</text>
  <text x="64" y="182" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">usenet killfiles &#8594; phpBB post counts &#8594; the social graph &#8594; atproto's public lexicons</text>

  <line x1="64" y1="220" x2="${W - 64}" y2="220" stroke="${INK}" stroke-width="2"/>

  ${ticks}

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">ontology.bisks.net</text>
  <text x="64" y="588" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">who gets to write the schema of a social relation, and where it lives</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

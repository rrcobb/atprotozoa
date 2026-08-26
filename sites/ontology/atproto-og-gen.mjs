// Generates public/atproto/og.png — the Open Graph preview card for the
// ontology.bisks.net/atproto companion page. Same recipe as og-gen.mjs
// (hand-drawn SVG, rasterised with @resvg/resvg-js and skyclone's bundled
// JetBrains Mono font).
//
//   node atproto-og-gen.mjs   # writes ./public/atproto/og.png

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const choices = [
  "no canonical Post",
  "blobs stay opaque",
  "a like points at a version",
  "identity = a bag of collections",
  "curation becomes an object",
  "judgment is an overlay",
  "derived facts nobody owns",
];

function row(y, label, i) {
  return `
  <g>
    <circle cx="64" cy="${y - 5}" r="4" fill="${ACCENT}"/>
    <text x="82" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${INK}">${i}. ${label}</text>
  </g>`;
}

const rows = choices.map((c, i) => row(266 + i * 40, c, i + 1)).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${INK}">ontology / atproto</text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">the specific choices, and what they imply</text>

  <line x1="64" y1="176" x2="${W - 64}" y2="176" stroke="${INK}" stroke-width="2"/>

  ${rows}

  <text x="64" y="586" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">ontology.bisks.net/atproto</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/atproto/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

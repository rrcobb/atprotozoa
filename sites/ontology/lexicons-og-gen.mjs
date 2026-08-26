// Generates public/lexicons/og.png — the Open Graph preview card for the
// ontology.bisks.net/lexicons companion page. Same recipe as og-gen.mjs and
// atproto-og-gen.mjs (hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font).
//
//   node lexicons-og-gen.mjs   # writes ./public/lexicons/og.png

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const rows = [
  "app.bsky.feed.post",
  "app.bsky.graph.follow",
  "com.atproto.repo.strongRef",
  "app.bsky.graph.list",
  "com.atproto.label.defs",
];

function row(y, label) {
  return `
  <g>
    <circle cx="64" cy="${y - 5}" r="4" fill="${ACCENT}"/>
    <text x="82" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${INK}">${label}</text>
  </g>`;
}

const rowsSvg = rows.map((r, i) => row(258 + i * 38, r)).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${INK}">ontology / lexicons</text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">the actual schema files, and what the type system can't say</text>

  <line x1="64" y1="176" x2="${W - 64}" y2="176" stroke="${INK}" stroke-width="2"/>

  <text x="64" y="220" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">reading:</text>
  ${rowsSvg}

  <line x1="64" y1="474" x2="${W - 64}" y2="474" stroke="${FAINT}" stroke-width="2"/>
  <text x="64" y="510" font-family="JetBrains Mono" font-size="17" fill="${INK}">what can a typed graph hold, and what falls outside it?</text>

  <text x="64" y="586" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">ontology.bisks.net/lexicons</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/lexicons/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

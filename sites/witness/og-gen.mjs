// Generates public/og.png — witness's Open Graph preview card. Hand-drawn
// SVG (paper-and-ink palette, matching public/style.css), rasterised with
// @resvg/resvg-js. Same recipe as sites/shelfguessr/og-gen.mjs and
// sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PAPER = "#f2ecda", PAPER_DARK = "#e4d8b3", INK = "#241f16", INK_SOFT = "#5c5240";
const STAMP = "#a03b2e", SEAL = "#2f5d42", CARD = "#fbf7ea", BORDER = "#cdbd91";

// A rubber-stamp ring, rotated, the way an ink stamp lands slightly off-true.
function stamp(cx, cy, rotate) {
  return `
    <g transform="rotate(${rotate} ${cx} ${cy})" opacity="0.92">
      <circle cx="${cx}" cy="${cy}" r="78" fill="none" stroke="${STAMP}" stroke-width="5"/>
      <circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="${STAMP}" stroke-width="2.5"/>
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="21" letter-spacing="2" fill="${STAMP}">WITNESSED</text>
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="3" fill="${STAMP}">ON THE RECORD</text>
    </g>`;
}

const receiptLines = [
  ["food pantry — march order", "$42.17"],
  ["elm st &amp; 4th ave — pothole", "reported 6×"],
  ["permit application #2291", "→ view original"],
];

function receiptCard(x, y, w, h) {
  let rows = "";
  const lineH = 46;
  receiptLines.forEach((line, i) => {
    const ly = y + 58 + i * lineH;
    rows += `
      <text x="${x + 24}" y="${ly}" font-family="JetBrains Mono" font-size="18" fill="${INK}">${line[0]}</text>
      <text x="${x + w - 24}" y="${ly}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${SEAL}">${line[1]}</text>
      ${i < receiptLines.length - 1 ? `<line x1="${x + 20}" y1="${ly + 18}" x2="${x + w - 20}" y2="${ly + 18}" stroke="${BORDER}" stroke-width="1.5" stroke-dasharray="3,5"/>` : ""}`;
  });
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${CARD}" stroke="${BORDER}" stroke-width="2.5"/>
    <text x="${x + 24}" y="${y + 34}" font-family="JetBrains Mono" font-weight="800" font-size="16" letter-spacing="2" fill="${INK_SOFT}">THE LEDGER</text>
    ${rows}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="10%" cy="0%" r="70%">
      <stop offset="0" stop-color="${PAPER_DARK}"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="168" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="${INK}">witness</text>
  <text x="66" y="210" font-family="JetBrains Mono" font-size="21" fill="${INK_SOFT}">a plain public ledger. no login to read.</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="17" fill="${INK_SOFT}">Post a receipt, a pothole, whatever needs</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="17" fill="${INK_SOFT}">a paper trail. Link the original document.</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="17" fill="${STAMP}">Repeat reports of the same spot tally up.</text>

  ${receiptCard(64, 380, 560, 180)}

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${INK}">witness.bisks.net</text>

  ${stamp(970, 200, -14)}
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

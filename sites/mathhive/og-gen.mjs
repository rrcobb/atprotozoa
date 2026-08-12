// Generates public/og.png — the Open Graph preview card for mathhive.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Copied and reflavored from sites/purrscue/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0f0a03", BG2 = "#241a08", FG = "#fff4dc", DIM = "#c9a96b";
const HONEY = "#f4a300", HONEY2 = "#ffd166", GOLD = "#ffe08a", CARD = "#1c1408", BORDER = "#4a3616";

const cardX = 90, cardY = 70, cardW = 1020, cardH = 490;
const midX = cardX + cardW / 2;

function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

// A small hand-drawn bee (oval body + stripes + two wing ellipses), since the
// rasterizer only loads the one JetBrains Mono font file (no emoji glyphs).
function bee(cx, cy) {
  return `<g transform="translate(${cx},${cy}) rotate(-15)">
    <ellipse cx="0" cy="-6" rx="15" ry="9" fill="#241a08" opacity="0.55"/>
    <ellipse cx="8" cy="-6" rx="15" ry="9" fill="#241a08" opacity="0.55"/>
    <ellipse cx="4" cy="0" rx="15" ry="9" fill="${GOLD}"/>
    <rect x="-3" y="-6" width="4" height="12" fill="#241a08"/>
    <rect x="5" y="-7" width="4" height="14" fill="#241a08"/>
  </g>`;
}

// A small honeycomb cluster of 7 hexes (center + ring of 6) up in the card.
const hiveCenter = { x: midX, y: cardY + 175 };
const size = 40;
const ringOffsets = [
  [0, 0],
  [size * 1.73, 0],
  [size * 0.87, size * 1.5],
  [-size * 0.87, size * 1.5],
  [-size * 1.73, 0],
  [-size * 0.87, -size * 1.5],
  [size * 0.87, -size * 1.5],
];
const cells = ringOffsets
  .map(([dx, dy], i) => {
    const fill = i === 0 ? HONEY : "#3a2a0c";
    const stroke = i === 0 ? GOLD : BORDER;
    return `<polygon points="${hexPoints(hiveCenter.x + dx, hiveCenter.y + dy, size - 3)}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.3" r="0.6">
      <stop offset="0" stop-color="${HONEY}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${HONEY}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="url(#glow)"/>

  ${cells}
  <text x="${hiveCenter.x}" y="${hiveCenter.y + 8}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#241a08">=?</text>
  ${bee(hiveCenter.x - 130, hiveCenter.y - 55)}
  ${bee(hiveCenter.x + 110, hiveCenter.y - 65)}

  <text x="${midX}" y="${cardY + 330}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${FG}">mathhive</text>
  <text x="${midX}" y="${cardY + 378}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${DIM}">a swarm solves your math problem</text>
  <text x="${midX}" y="${cardY + 414}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">one bee per step, one honeycomb cell at a time</text>

  <text x="${midX}" y="${cardY + cardH - 30}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${HONEY2}">mathhive.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");

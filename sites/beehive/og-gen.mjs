// Generates public/og.png — the Open Graph preview card for beehive.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Copied and reflavored from sites/mathhive/og-gen.mjs.
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

function bee(cx, cy) {
  return `<g transform="translate(${cx},${cy}) rotate(-15)">
    <ellipse cx="0" cy="-6" rx="15" ry="9" fill="#241a08" opacity="0.55"/>
    <ellipse cx="8" cy="-6" rx="15" ry="9" fill="#241a08" opacity="0.55"/>
    <ellipse cx="4" cy="0" rx="15" ry="9" fill="${GOLD}"/>
    <rect x="-3" y="-6" width="4" height="12" fill="#241a08"/>
    <rect x="5" y="-7" width="4" height="14" fill="#241a08"/>
  </g>`;
}

// A growing honeycomb: center + two full rings, outermost ring drawn as
// still-empty outlines to read as "the hive keeps expanding".
const hiveCenter = { x: midX, y: cardY + 185 };
const size = 34;
function ringOffsets(radius) {
  if (radius === 0) return [[0, 0]];
  const out = [];
  const dirs = [
    [size * 1.73, 0], [size * 0.87, size * 1.5], [-size * 0.87, size * 1.5],
    [-size * 1.73, 0], [-size * 0.87, -size * 1.5], [size * 0.87, -size * 1.5],
  ];
  let x = dirs[4][0] * radius, y = dirs[4][1] * radius;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      out.push([x, y]);
      x += dirs[side][0]; y += dirs[side][1];
    }
  }
  return out;
}

const ring0 = ringOffsets(0);
const ring1 = ringOffsets(1);
const ring2 = ringOffsets(2);

const filledCells = [...ring0, ...ring1]
  .map(([dx, dy], i) => {
    const fill = i === 0 ? HONEY2 : HONEY;
    const stroke = i === 0 ? GOLD : BORDER;
    return `<polygon points="${hexPoints(hiveCenter.x + dx, hiveCenter.y + dy, size - 3)}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
  })
  .join("\n  ");

const emptyCells = ring2
  .map(([dx, dy]) => `<polygon points="${hexPoints(hiveCenter.x + dx, hiveCenter.y + dy, size - 4)}" fill="none" stroke="${BORDER}" stroke-width="2" stroke-dasharray="4 3"/>`)
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

  ${emptyCells}
  ${filledCells}
  <text x="${hiveCenter.x}" y="${hiveCenter.y + 7}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#241a08">+</text>
  ${bee(hiveCenter.x - 145, hiveCenter.y - 90)}
  ${bee(hiveCenter.x + 130, hiveCenter.y - 100)}
  ${bee(hiveCenter.x + 160, hiveCenter.y + 40)}

  <text x="${midX}" y="${cardY + 355}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${FG}">beehive</text>
  <text x="${midX}" y="${cardY + 400}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${DIM}">solve math, grow your bee colony</text>
  <text x="${midX}" y="${cardY + 434}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">every right answer builds another cell — harder as the hive grows</text>

  <text x="${midX}" y="${cardY + cardH - 30}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${HONEY2}">beehive.bisks.net</text>
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

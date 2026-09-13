// Generates public/og.png — the Open Graph preview card for fruitflyheaven.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Copied and reflavored from sites/beehive/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070b05", BG2 = "#16250c", FG = "#eafce0", DIM = "#92ad84";
const LEAF = "#7fd858", LEAF2 = "#b6f27a", GOLD = "#ffd166", CARD = "#101c0b", BORDER = "#26401d";

const cardX = 90, cardY = 70, cardW = 1020, cardH = 490;
const midX = cardX + cardW / 2;

// A small ring of "neurons" standing in for the connectome diagram, wired
// with a few crossing edges so it reads as a circuit, not a decoration.
const brainCx = midX, brainCy = cardY + 175, brainR = 95;
const nodeCount = 10;
const nodes = [];
for (let i = 0; i < nodeCount; i++) {
  const a = (i / nodeCount) * Math.PI * 2 - Math.PI / 2;
  nodes.push({ x: brainCx + Math.cos(a) * brainR, y: brainCy + Math.sin(a) * brainR });
}
const edges = [
  [0, 3], [1, 4], [2, 6], [3, 7], [4, 8], [5, 9], [0, 5], [2, 8], [6, 1], [7, 3],
];
const edgeLines = edges
  .map(([a, b]) => `<line x1="${nodes[a].x.toFixed(1)}" y1="${nodes[a].y.toFixed(1)}" x2="${nodes[b].x.toFixed(1)}" y2="${nodes[b].y.toFixed(1)}" stroke="${LEAF}" stroke-opacity="0.28" stroke-width="1.6"/>`)
  .join("\n  ");
const litNodes = new Set([0, 3, 4, 8, 6]);
const nodeDots = nodes
  .map((n, i) => {
    const lit = litNodes.has(i);
    const r = lit ? 9 : 6;
    const fill = lit ? GOLD : LEAF;
    return `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="${fill}" ${lit ? `opacity="0.95"` : `opacity="0.6"`}/>`;
  })
  .join("\n  ");

function fly(cx, cy) {
  return `<g transform="translate(${cx},${cy}) rotate(18)">
    <ellipse cx="-2" cy="-9" rx="13" ry="5.5" fill="${FG}" opacity="0.5"/>
    <ellipse cx="-2" cy="9" rx="13" ry="5.5" fill="${FG}" opacity="0.5"/>
    <ellipse cx="-4" cy="0" rx="9" ry="5.5" fill="#1a1208"/>
    <circle cx="6" cy="0" r="4" fill="#c0392b"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.3" r="0.6">
      <stop offset="0" stop-color="${LEAF}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${LEAF}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="url(#glow)"/>

  ${edgeLines}
  ${nodeDots}
  ${fly(brainCx + brainR + 55, brainCy - 40)}
  ${fly(brainCx - brainR - 60, brainCy + 30)}

  <text x="${midX}" y="${cardY + 345}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="54" fill="${FG}">fruitflyheaven</text>
  <text x="${midX}" y="${cardY + 390}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a connectome-driven fly in a garden</text>
  <text x="${midX}" y="${cardY + 424}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">retina → mushroom body → central complex, live, in your browser</text>

  <text x="${midX}" y="${cardY + cardH - 30}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${LEAF2}">fruitflyheaven.bisks.net</text>
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

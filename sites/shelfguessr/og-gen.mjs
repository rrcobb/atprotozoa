// Generates public/og.png — shelfguessr's default Open Graph preview card.
// Hand-drawn SVG (warm reading-room palette, no external assets — the
// bookshelf is drawn with plain rects since resvg has no emoji glyphs
// available), rasterised with @resvg/resvg-js. Same recipe as
// sites/catspace/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PAPER = "#f4ecd8", PAPER_DARK = "#e6dabd", FOREST = "#234d38", FOREST_DARK = "#16332a";
const GOLD = "#c9922e", INK = "#2c2416", CARD = "#fffaf0";

const SPINE_COLORS = ["#a5382e", "#2f6e42", "#c9922e", "#3a5a8c", "#7a4a9c", "#b06a2e", "#234d38"];

// A row of book spines: varying widths/heights sitting on a shelf line, plus
// one pin marker (the "guess" cursor) hovering over a randomly chosen spine.
function shelfRow(x, y, w, seed) {
  let out = "";
  let cx = x;
  let i = 0;
  const rng = mulberry32(seed);
  while (cx < x + w - 10) {
    const bw = 14 + Math.floor(rng() * 20);
    const bh = 70 + Math.floor(rng() * 40);
    const color = SPINE_COLORS[i % SPINE_COLORS.length];
    out += `<rect x="${cx}" y="${y - bh}" width="${bw}" height="${bh}" fill="${color}" rx="2" />`;
    cx += bw + 4;
    i++;
  }
  out += `<rect x="${x}" y="${y}" width="${w}" height="8" fill="${FOREST_DARK}" rx="2" />`;
  return out;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pin(cx, cy) {
  return `
    <g>
      <path d="M ${cx} ${cy + 30} C ${cx - 22} ${cy} ${cx - 22} ${cy - 24} ${cx} ${cy - 24} C ${cx + 22} ${cy - 24} ${cx + 22} ${cy} ${cx} ${cy + 30} Z" fill="${GOLD}" stroke="${FOREST_DARK}" stroke-width="3" />
      <circle cx="${cx}" cy="${cy - 6}" r="8" fill="${FOREST_DARK}" />
    </g>`;
}

const shelves = [
  shelfRow(700, 210, 380, 7),
  shelfRow(700, 340, 380, 42),
  shelfRow(700, 470, 380, 99),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PAPER}"/>
      <stop offset="1" stop-color="${PAPER_DARK}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <rect x="660" y="150" width="460" height="380" rx="14" fill="${FOREST}" opacity="0.08"/>
  ${shelves.join("")}
  ${pin(830, 258)}

  <text x="80" y="220" font-family="JetBrains Mono" font-weight="800" font-size="86" fill="${FOREST_DARK}">shelf</text>
  <text x="80" y="300" font-family="JetBrains Mono" font-weight="800" font-size="86" fill="${GOLD}">guessr</text>
  <text x="84" y="350" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">GeoGuessr, but the map is your SimCluster</text>
  <text x="84" y="384" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">and the location is a bookshelf.</text>

  <rect x="80" y="430" width="500" height="140" rx="16" fill="${CARD}" stroke="${FOREST}" stroke-width="3" stroke-dasharray="2,6"/>
  <text x="106" y="472" font-family="JetBrains Mono" font-size="20" fill="${INK}">upload your shelf</text>
  <text x="106" y="504" font-family="JetBrains Mono" font-size="20" fill="${INK}">guess your mutuals' shelves</text>
  <text x="106" y="536" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FOREST}">climb the network leaderboard</text>

  <text x="84" y="600" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${FOREST_DARK}">shelfguessr.bisks.net</text>
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

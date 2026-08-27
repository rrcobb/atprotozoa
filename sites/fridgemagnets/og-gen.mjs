// Generates public/og.png — the Open Graph preview card for fridgemagnets.
// Same recipe as sites/acid100/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const STEEL_A = "#dde2e6", STEEL_B = "#b9c1c7", INK = "#14110c", MUTED = "#5b6167";
const PALETTE = [
  { bg: "#f5f1e6", ink: "#14110c" },
  { bg: "#eaf1fb", ink: "#10233c" },
  { bg: "#fdecef", ink: "#4a1220" },
  { bg: "#e9f5ea", ink: "#123821" },
  { bg: "#fff3d6", ink: "#4a350a" },
  { bg: "#efeaf8", ink: "#241a4a" },
];

// a little poem built from the actual top-ranked words in the corpus
const LINES = [
  [{ w: "load-bearing", s: 46 }, { w: "quietly", s: 34 }],
  [{ w: "genuinely", s: 30 }, { w: "half", s: 40 }, { w: "honest", s: 34 }],
  [{ w: "survives", s: 30 }, { w: "the", s: 22 }, { w: "refusal", s: 34 }],
];

// monospace, so char width is a fixed fraction of font-size
const CHAR_W = 0.6;
const PAD_X = 16, PAD_Y = 10;

function tileWidth(word, size) {
  return Math.round(word.length * size * CHAR_W + PAD_X * 2);
}

let tiles = "";
let paletteI = 0;
let y = 210;
for (const line of LINES) {
  let x = 90;
  const rowH = Math.max(...line.map((t) => t.s)) + PAD_Y * 2;
  for (const { w, s } of line) {
    const tw = tileWidth(w, s);
    const th = s + PAD_Y * 2;
    const rot = (paletteI % 2 === 0 ? -1 : 1) * (2 + (paletteI % 3));
    const c = PALETTE[paletteI % PALETTE.length];
    paletteI++;
    const cx = x + tw / 2, cy = y + th / 2;
    tiles += `
      <g transform="rotate(${rot} ${cx} ${cy})">
        <rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="4" fill="${c.bg}" stroke="${INK}" stroke-width="2"/>
        <text x="${cx}" y="${cy + s * 0.32}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="${s}" fill="${c.ink}">${w}</text>
      </g>`;
    x += tw + 18;
  }
  y += rowH + 22;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${STEEL_A}"/>
      <stop offset="1" stop-color="${STEEL_B}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#steel)"/>
  ${Array.from({ length: 12 }, (_, i) => `<rect x="0" y="${i * 54}" width="${W}" height="1" fill="#ffffff" opacity="0.35"/>`).join("")}

  <rect x="70" y="46" width="300" height="46" rx="4" fill="${INK}"/>
  <text x="88" y="77" font-family="JetBrains Mono" font-weight="800" font-size="24" letter-spacing="1" fill="#f5f1e6">FRIDGEMAGNETS</text>

  ${tiles}

  <text x="90" y="${H - 96}" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">1000 of Claude's own most load-bearing words —</text>
  <text x="90" y="${H - 68}" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">yours to drag around a fridge door.</text>

  <text x="90" y="${H - 30}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">fridgemagnets.bisks.net</text>
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

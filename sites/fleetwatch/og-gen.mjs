// Generates public/og.png — the static Open Graph preview card for the bare
// fleetwatch.bisks.net link. Hand-drawn SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts and loaded
// explicitly). Same recipe as sites/orrery/og-gen.mjs and
// sites/fleetswipe/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0f1115";
const CARD = "#171a21";
const BORDER = "#2a2e38";
const FG = "#eef0f4";
const DIM = "#9198a8";
const UP = "#52d68a";
const DOWN = "#ff5f7e";
const TIMEOUT = "#f2b84b";

function tile(x, y, w, h, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${CARD}" stroke="${BORDER}"/>
  <rect x="${x + 10}" y="${y + h / 2 - 3}" width="6" height="6" rx="3" fill="${color}"/>`;
}

// A little grid of status tiles, mostly green, a couple red/amber — the
// board mid-scan.
const colors = [UP, UP, UP, DOWN, UP, UP, TIMEOUT, UP, UP, UP, UP, UP, UP, UP, DOWN, UP, UP, UP, UP, UP, UP, UP, TIMEOUT, UP];
let tiles = "";
const cols = 6, tw = 82, th = 40, gap = 8;
colors.forEach((c, i) => {
  const col = i % cols, row = Math.floor(i / cols);
  tiles += tile(60 + col * (tw + gap), 110 + row * (th + gap), tw, th, c);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${tiles}

  <text x="700" y="220" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${FG}">fleetwatch</text>
  <text x="702" y="270" font-family="JetBrains Mono" font-size="22" fill="${DIM}">is the bisks.net fleet still up?</text>

  <text x="702" y="330" font-family="JetBrains Mono" font-size="17" fill="${DIM}">pings every site, live, from your browser</text>
  <text x="702" y="358" font-family="JetBrains Mono" font-size="17" fill="${DIM}">green = answered &#183; red = didn't</text>

  <text x="702" y="440" font-family="JetBrains Mono" font-size="20" fill="${UP}">&#9679; up</text>
  <text x="800" y="440" font-family="JetBrains Mono" font-size="20" fill="${DOWN}">&#9679; down</text>
  <text x="910" y="440" font-family="JetBrains Mono" font-size="20" fill="${TIMEOUT}">&#9679; timeout</text>

  <text x="702" y="540" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${UP}">fleetwatch.bisks.net</text>
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

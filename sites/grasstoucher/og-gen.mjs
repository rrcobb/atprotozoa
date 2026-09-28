// Generates public/og.png — the Open Graph preview card for grasstoucher.
// Drawn shapes, not emoji: the bundled mono font has no color-emoji glyphs
// and resvg would render a tofu box instead (same reasoning as
// sites/crushcookie/og-gen.mjs, which this is copied and reflavored from).
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed).
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

const BG1 = "#f3f8ee", BG2 = "#e4f0d9";
const INK = "#253620", DIM = "#5f7355";
const GOLD = "#c99a3a", LEAF = "#4c8c3f", LEAF_DARK = "#34632b", BARK = "#7a5c3e";

// A little tree on a mound, next to a paper slip of unsolicited advice.
function tree(cx, cy, s) {
  return `
  <g>
    <rect x="${(cx - 6 * s).toFixed(1)}" y="${(cy - 2 * s).toFixed(1)}" width="${(12 * s).toFixed(1)}" height="${(46 * s).toFixed(1)}" rx="${3 * s}" fill="${BARK}"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${(cy - 30 * s).toFixed(1)}" rx="${50 * s}" ry="${40 * s}" fill="${LEAF}"/>
    <ellipse cx="${(cx - 24 * s).toFixed(1)}" cy="${(cy - 12 * s).toFixed(1)}" rx="${30 * s}" ry="${24 * s}" fill="#5c9c4c"/>
    <ellipse cx="${(cx + 26 * s).toFixed(1)}" cy="${(cy - 12 * s).toFixed(1)}" rx="${30 * s}" ry="${24 * s}" fill="#5c9c4c"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${(cy - 50 * s).toFixed(1)}" rx="${34 * s}" ry="${26 * s}" fill="#6cac5a"/>
  </g>`;
}

// A little leaf, for the scatter around the tree.
function leaf(cx, cy, s, color, rot) {
  return `<path d="M ${cx} ${cy + 8 * s} C ${cx - 14 * s} ${cy - 6 * s} ${cx - 6 * s} ${cy - 18 * s} ${cx} ${cy - 8 * s} C ${cx + 6 * s} ${cy - 18 * s} ${cx + 14 * s} ${cy - 6 * s} ${cx} ${cy + 8 * s} Z" fill="${color}" transform="rotate(${rot} ${cx} ${cy})"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${LEAF_DARK}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${LEAF_DARK}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${LEAF_DARK}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="url(#title)">grasstoucher</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="20" fill="${DIM}">an unsolicited wellness intervention</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${INK}">Tap the tree for a condescending</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${INK}">lecture: log off, touch grass,</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${INK}">reconnect with your senses.</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${INK}">A grass-touched rating, a</text>
  <text x="66" y="382" font-family="JetBrains Mono" font-size="18" fill="${INK}">prescription, a card to share.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${LEAF_DARK}">grasstoucher.bisks.net</text>

  ${leaf(800, 230, 1.6, LEAF_DARK, -10)}
  ${leaf(1050, 260, 1.1, GOLD, 14)}
  ${leaf(870, 470, 1.3, LEAF_DARK, 20)}
  ${leaf(1080, 470, 0.9, GOLD, -16)}
  ${tree(960, 420, 1.9)}
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

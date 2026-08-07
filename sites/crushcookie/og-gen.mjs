// Generates public/og.png — the Open Graph preview card for crushcookie.
// Drawn shapes, not emoji: the bundled mono font has no color-emoji glyphs
// and resvg would render a tofu box instead (same reasoning as
// sites/warmhug/og-gen.mjs and sites/fortunejar/og-gen.mjs, which this is
// copied and reflavored from).
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

const BG1 = "#fff0f4", BG2 = "#ffe1ea";
const INK = "#4a1f2e", DIM = "#8a5c6c";
const GOLD = "#f2a444", ROSE = "#e8437a", COOKIE = "#c68958", COOKIE2 = "#a5723f";

// A cracked fortune cookie: two curved halves pulled apart, a paper slip
// rising between them.
function cookie(cx, cy, s) {
  const t = (x, y) => `${(cx + x * s).toFixed(1)},${(cy + y * s).toFixed(1)}`;
  return `
  <g>
    <g transform="translate(${(-34 * s).toFixed(1)},${(6 * s).toFixed(1)}) rotate(-16 ${cx} ${cy})">
      <path d="M ${t(-70, -10)} Q ${t(-92, 30)} ${t(-60, 62)} Q ${t(-20, 70)} ${t(-6, 40)} Q ${t(-8, 4)} ${t(-70, -10)} Z" fill="${COOKIE}" stroke="${COOKIE2}" stroke-width="${3 * s}"/>
    </g>
    <g transform="translate(${(34 * s).toFixed(1)},${(6 * s).toFixed(1)}) rotate(16 ${cx} ${cy})">
      <path d="M ${t(70, -10)} Q ${t(92, 30)} ${t(60, 62)} Q ${t(20, 70)} ${t(6, 40)} Q ${t(8, 4)} ${t(70, -10)} Z" fill="${COOKIE}" stroke="${COOKIE2}" stroke-width="${3 * s}"/>
    </g>
    <rect x="${(cx - 46 * s).toFixed(1)}" y="${(cy - 46 * s).toFixed(1)}" width="${(92 * s).toFixed(1)}" height="${(58 * s).toFixed(1)}" rx="${4 * s}" fill="#fffaf6" stroke="${DIM}" stroke-width="${1.5 * s}" transform="rotate(-4 ${cx} ${cy})"/>
  </g>`;
}

// A little heart, for the scatter around the cookie.
function heart(cx, cy, s, color, rot) {
  return `<path d="M ${cx} ${cy + 8 * s} C ${cx - 14 * s} ${cy - 6 * s} ${cx - 6 * s} ${cy - 18 * s} ${cx} ${cy - 8 * s} C ${cx + 6 * s} ${cy - 18 * s} ${cx + 14 * s} ${cy - 6 * s} ${cx} ${cy + 8 * s} Z" fill="${color}" transform="rotate(${rot} ${cx} ${cy})"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${ROSE}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${ROSE}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ROSE}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">crushcookie</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">silly fortune cookies for your love life</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${INK}">Crack one open for silly,</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${INK}">feel-good advice on crushes,</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${INK}">situationships, and long hauls.</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${INK}">A cupid rating, a move to make,</text>
  <text x="66" y="382" font-family="JetBrains Mono" font-size="18" fill="${INK}">and a card to share it with.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ROSE}">crushcookie.bisks.net</text>

  ${heart(800, 230, 1.6, ROSE, -10)}
  ${heart(1050, 260, 1.1, GOLD, 14)}
  ${heart(870, 470, 1.3, ROSE, 20)}
  ${heart(1080, 470, 0.9, GOLD, -16)}
  ${cookie(960, 370, 1.9)}
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

// Generates public/og.png — the Open Graph preview card for lovecoupons.
// Drawn shapes, not emoji: the bundled mono font has no color-emoji glyphs
// and resvg would render a tofu box instead (same reasoning as
// sites/lovejar/og-gen.mjs, which this file is copied from).
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

const BG1 = "#2b1220", BG2 = "#1a0a14";
const DIM = "#d9b3c2";
const PINK = "#ff6f91", GOLD = "#ffd97a", CREAM = "#fff3ee";
const PAPER = "#fff6ea", PAPER2 = "#ffe9d1", INK = "#4a2c1a", TAN = "#c98f5a";

function baseSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="14%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${PINK}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${PINK}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="88%" cy="5%" r="50%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PAPER}"/>
      <stop offset="1" stop-color="${PAPER2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  ${inner}
</svg>`;
}

function heart(cx, cy, s, fill) {
  return `<path d="M ${cx},${cy + 10 * s} C ${cx - 16 * s},${cy - 6 * s} ${cx - 40 * s},${cy + 2 * s} ${cx - 40 * s},${cy + 22 * s}
    C ${cx - 40 * s},${cy + 40 * s} ${cx - 18 * s},${cy + 52 * s} ${cx},${cy + 70 * s}
    C ${cx + 18 * s},${cy + 52 * s} ${cx + 40 * s},${cy + 40 * s} ${cx + 40 * s},${cy + 22 * s}
    C ${cx + 40 * s},${cy + 2 * s} ${cx + 16 * s},${cy - 6 * s} ${cx},${cy + 10 * s} Z" fill="${fill}"/>`;
}

// A little dashed-border coupon ticket, tilted, with a perforated left edge
// (small notches) and a heart stamped in the corner.
function couponArt(cx, cy, s, rot, label) {
  const w = 260 * s, h = 150 * s;
  const notches = [];
  for (let i = -3; i <= 3; i++) {
    notches.push(`<circle cx="${cx - w / 2}" cy="${cy + i * (h / 7)}" r="${8 * s}" fill="${BG1}"/>`);
  }
  return `
  <g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${10 * s}"
      fill="url(#paper)" stroke="${TAN}" stroke-width="${3 * s}" stroke-dasharray="${8 * s} ${6 * s}"/>
    ${notches.join("\n    ")}
    ${heart(cx + w / 2 - 34 * s, cy - h / 2 + 30 * s, 0.55 * s, PINK)}
    <text x="${cx - w / 2 + 22 * s}" y="${cy + 4 * s}" font-family="JetBrains Mono" font-weight="700" font-size="${17 * s}" fill="${INK}">${label}</text>
  </g>`;
}

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
function render(svg, outName) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
  });
  const png = r.render().asPng();
  const out = new URL(`./public/${outName}`, import.meta.url).pathname;
  writeFileSync(out, png);
  console.log("wrote", out, png.length, "bytes");
}

const ogSvg = baseSvg(`
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">coupon book</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a love-language toy</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Pick a love language, clip a</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">shareable coupon book — "one</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">free hug," "one dinner cooked</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${DIM}">together." Redeem for real.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">lovecoupons.bisks.net</text>

  ${couponArt(900, 250, 1.55, -8, "one (1) free hug")}
  ${couponArt(940, 400, 1.4, 6, "one dinner, cooked")}
`);
render(ogSvg, "og.png");

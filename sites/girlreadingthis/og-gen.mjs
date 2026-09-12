// Generates public/og.png — the Open Graph preview card for
// "the girl reading this". Plain shapes, not emoji: the bundled mono font
// has no color-emoji glyphs and resvg would render a tofu box instead (same
// reasoning as sites/gratitude-garden/og-gen.mjs). Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed).
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

const INK = "#3a2b3f", MUTED = "#8a7591", ACCENT = "#c968a8", ACCENT2 = "#7d6bc4";
const PAPER = "#fbeef6", CARD = "#fffbfe", BORDER = "#eeddec";

function heart(cx, cy, r, color, rotate) {
  return `<path d="M ${cx} ${cy + r * 0.6}
    C ${cx - r * 1.3} ${cy - r * 0.5}, ${cx - r * 0.4} ${cy - r * 1.3}, ${cx} ${cy - r * 0.5}
    C ${cx + r * 0.4} ${cy - r * 1.3}, ${cx + r * 1.3} ${cy - r * 0.5}, ${cx} ${cy + r * 0.6} Z"
    fill="${color}" transform="rotate(${rotate} ${cx} ${cy})" opacity="0.85"/>`;
}

const cardX = 60, cardY = 340, cardW = 1080, cardH = 230;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#f6d9ec"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#e2d9f6"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  ${heart(120, 90, 26, ACCENT, -12)}
  ${heart(1080, 120, 34, ACCENT2, 18)}
  ${heart(1000, 260, 18, ACCENT, 8)}
  ${heart(70, 260, 16, ACCENT2, -20)}

  <text x="64" y="180" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">the girl reading this</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">a small, sincere line, one at a time.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 48}" y="${cardY + 90}" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${ACCENT}">the girl reading this</text>
  <text x="${cardX + 48}" y="${cardY + 140}" font-family="JetBrains Mono" font-size="26" fill="${INK}">is doing better than she thinks.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">girlreadingthis.bisks.net</text>
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

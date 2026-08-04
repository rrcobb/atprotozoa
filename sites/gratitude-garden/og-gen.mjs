// Generates public/og.png — the Open Graph preview card for gratitude
// garden. Drawn flowers, not emoji: the bundled mono font has no
// color-emoji glyphs and resvg would render a tofu box instead (same
// reasoning as sites/cluckstonks/og-gen.mjs, which drew a chicken silhouette
// for the same reason). Rasterised with @resvg/resvg-js (pure native module,
// no system Chromium/fontconfig needed).
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

const INK = "#3a2e28", MUTED = "#8a7362", ACCENT = "#d9536f", ACCENT2 = "#5c9169";
const PAPER = "#fbf2e6", CARD = "#fffaf2", BORDER = "#ecdcc2";

// A simple five-petal flower: a ring of petal ellipses around a center dot.
function flower(cx, cy, r, petalColor, centerColor, rotate) {
  const petals = [];
  const petalCount = 5;
  const petalLen = r * 1.15, petalW = r * 0.62;
  for (let i = 0; i < petalCount; i++) {
    const angle = rotate + (360 / petalCount) * i;
    const rad = (angle * Math.PI) / 180;
    const px = cx + Math.cos(rad) * r * 0.55;
    const py = cy + Math.sin(rad) * r * 0.55;
    petals.push(
      `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${petalLen.toFixed(1)}" ry="${petalW.toFixed(1)}" fill="${petalColor}" transform="rotate(${angle.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})"/>`
    );
  }
  return `<g>${petals.join("")}<circle cx="${cx}" cy="${cy}" r="${(r * 0.42).toFixed(1)}" fill="${centerColor}"/></g>`;
}

function stem(x, y1, y2, color) {
  return `<path d="M ${x} ${y1} Q ${x - 14} ${(y1 + y2) / 2} ${x} ${y2}" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const groundY = cardY + cardH - 70;

const bouquet = [
  { cx: cardX + 150, r: 46, petal: ACCENT, center: "#f7d94c", rotate: 8 },
  { cx: cardX + 300, r: 58, petal: "#e88a4e", center: "#fbeee0", rotate: -6 },
  { cx: cardX + 440, r: 42, petal: "#c96fa3", center: "#fbeee0", rotate: 20 },
  { cx: cardX + 560, r: 50, petal: ACCENT2, center: "#fbeee0", rotate: -14 },
];

const stemsSvg = bouquet.map((f) => stem(f.cx, groundY - f.r * 0.6, groundY + 60, ACCENT2)).join("\n  ");
const flowersSvg = bouquet
  .map((f) => flower(f.cx, groundY - f.r * 0.6, f.r, f.petal, f.center, f.rotate))
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#fbe0e8"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#e3f0da"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">gratitude</text>
  <text x="64" y="220" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${ACCENT}">garden</text>

  <text x="66" y="288" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">Plant a flower with a kind word.</text>
  <text x="66" y="318" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">Tend a small garden. Grow a</text>
  <text x="66" y="348" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">bouquet and send it to someone.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">gratitude-garden.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${stemsSvg}
  ${flowersSvg}
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

// Generates public/og.png — the Open Graph preview card for grudge garden.
// Drawn wilted flowers, not emoji: the bundled mono font has no color-emoji
// glyphs and resvg would render a tofu box instead (same reasoning as
// sites/gratitude-garden/og-gen.mjs, which drew flowers for the same reason —
// this is the opposite artwork: drooping petals, thorny stems, dark palette).
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

const INK = "#e7dfe6", MUTED = "#93849a", ACCENT = "#b8324a", ACCENT2 = "#7fa33e";
const PAPER = "#130f16", CARD = "#1c1620", BORDER = "#362a3d";

// A wilted five-petal flower: petals droop downward (rotated toward 90deg)
// instead of fanning out evenly, with a shrunken, muddy center.
function wiltedFlower(cx, cy, r, petalColor, centerColor, droop) {
  const petals = [];
  const petalCount = 5;
  const petalLen = r * 1.1, petalW = r * 0.5;
  for (let i = 0; i < petalCount; i++) {
    const spread = -70 + (140 / (petalCount - 1)) * i;
    const angle = 90 + droop + spread * 0.55;
    const rad = (angle * Math.PI) / 180;
    const px = cx + Math.cos(rad) * r * 0.5;
    const py = cy + Math.sin(rad) * r * 0.5;
    petals.push(
      `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${petalLen.toFixed(1)}" ry="${petalW.toFixed(1)}" fill="${petalColor}" opacity="0.88" transform="rotate(${angle.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})"/>`
    );
  }
  return `<g>${petals.join("")}<circle cx="${cx}" cy="${cy}" r="${(r * 0.36).toFixed(1)}" fill="${centerColor}"/></g>`;
}

// A crooked, thorned stem: a jagged path with small triangular thorns.
function thornStem(x, y1, y2, color) {
  const midY = (y1 + y2) / 2;
  const path = `M ${x} ${y1} Q ${x + 16} ${midY} ${x - 6} ${y2}`;
  const thorns = [];
  const thornYs = [y1 + (y2 - y1) * 0.35, y1 + (y2 - y1) * 0.65];
  thornYs.forEach((ty, i) => {
    const tx = i === 0 ? x + 12 : x - 4;
    const dir = i === 0 ? 1 : -1;
    thorns.push(
      `<path d="M ${tx} ${ty} l ${9 * dir} -5 l 0 10 Z" fill="${color}"/>`
    );
  });
  return `<path d="${path}" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>${thorns.join("")}`;
}

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const groundY = cardY + cardH - 70;

const bouquet = [
  { cx: cardX + 150, r: 44, petal: ACCENT, center: "#3a1a1f", droop: 18 },
  { cx: cardX + 300, r: 54, petal: "#7a3a2e", center: "#241812", droop: -12 },
  { cx: cardX + 440, r: 40, petal: "#5c3a5c", center: "#241827", droop: 26 },
  { cx: cardX + 560, r: 48, petal: ACCENT2, center: "#1c2416", droop: -20 },
];

const stemsSvg = bouquet.map((f) => thornStem(f.cx, groundY - f.r * 0.5, groundY + 60, ACCENT2)).join("\n  ");
const flowersSvg = bouquet
  .map((f) => wiltedFlower(f.cx, groundY - f.r * 0.5, f.r, f.petal, f.center, f.droop))
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2c1420"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#16261a"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">grudge</text>
  <text x="64" y="220" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${ACCENT}">garden</text>

  <text x="66" y="288" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">Plant a thorn with a grudge.</text>
  <text x="66" y="318" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">Tend a garden of spite. Brew a</text>
  <text x="66" y="348" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">bad-vibes bouquet for someone.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">grudge-garden.bisks.net</text>

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

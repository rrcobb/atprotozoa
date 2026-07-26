// Generates public/og.png — the Open Graph preview card for windmill.
//
// A generic (client-only site, no per-result server render) propaganda-poster
// style card: a windmill silhouette on a red/gold field, the title, and the
// barter-vs-credit pitch. Rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/lavalamp/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const CREAM = "#f0e6d2";
const INK = "#241b12";
const RED = "#8f1b1b";
const GOLD = "#b8902f";
const GREEN = "#3c5a34";

// windmill silhouette: tower + four sails, drawn as simple polygons so it
// rasterises cleanly at any size without an external asset.
const cx = 260, cy = 420, towerW = 70, towerH = 210;
const sailLen = 150, sailW = 22;

function sail(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const hubX = cx, hubY = cy - towerH;
  const tipX = hubX + Math.cos(a) * sailLen;
  const tipY = hubY + Math.sin(a) * sailLen;
  const perpX = Math.cos(a + Math.PI / 2) * (sailW / 2);
  const perpY = Math.sin(a + Math.PI / 2) * (sailW / 2);
  return `<polygon points="${hubX - perpX},${hubY - perpY} ${hubX + perpX},${hubY + perpY} ${tipX},${tipY}" fill="${INK}" opacity="0.88"/>`;
}

const sails = [20, 110, 200, 290].map(sail).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${CREAM}"/>
      <stop offset="1" stop-color="#e2d5b0"/>
    </linearGradient>
    <radialGradient id="glow" cx="18%" cy="60%" r="55%">
      <stop offset="0" stop-color="rgba(143,27,27,0.16)"/>
      <stop offset="1" stop-color="rgba(143,27,27,0)"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${INK}" stroke-width="10"/>

  <!-- ground -->
  <rect x="0" y="${cy}" width="${W}" height="${H - cy}" fill="${GREEN}" opacity="0.85"/>

  <!-- windmill -->
  <polygon points="${cx - towerW / 2},${cy} ${cx + towerW / 2},${cy} ${cx + towerW / 2 - 16},${cy - towerH} ${cx - towerW / 2 + 16},${cy - towerH}" fill="${INK}"/>
  <circle cx="${cx}" cy="${cy - towerH}" r="14" fill="${INK}"/>
  ${sails}

  <!-- wordmark -->
  <text x="440" y="200" font-family="JetBrains Mono" font-weight="700" font-size="76" fill="${RED}">WINDMILL</text>
  <text x="440" y="248" font-family="JetBrains Mono" font-size="24" fill="${INK}" opacity="0.75">the Animal Farm economy game</text>

  <text x="440" y="330" font-family="JetBrains Mono" font-size="23" fill="${INK}">🌾 Barter: earn it, then build it. No debt, no bust.</text>
  <text x="440" y="372" font-family="JetBrains Mono" font-size="23" fill="${RED}">🏦 Credit: borrow, set the rate, ride the bubble.</text>

  <text x="440" y="440" font-family="JetBrains Mono" font-size="21" fill="${INK}" opacity="0.65">sixteen seasons · one windmill · two systems</text>

  <text x="440" y="560" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">windmill.bisks.net</text>
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

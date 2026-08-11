// Generates public/og.png — the Open Graph preview card for honkfeed.
//
// Hand-drawn "big top circus poster" SVG at the canonical OG size, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed — this
// box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly). No emoji glyphs (DejaVu Serif has none) --
// the clown face is drawn from plain shapes instead.
// Copied from abstractodo/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const PAPER = "#fff8ec";
const INK = "#241428";
const RED = "#e5342a";
const YELLOW = "#ffcd3c";
const BLUE = "#2e6cf0";
const PURPLE = "#8b3fd6";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// scalloped big-top edge: alternating red/yellow triangles
function scallops(y, flip) {
  const teeth = 20;
  const w = W / teeth;
  let out = "";
  for (let i = 0; i < teeth; i++) {
    const x = i * w;
    const color = i % 2 === 0 ? RED : YELLOW;
    const tipY = flip ? y - 26 : y + 26;
    out += `<polygon points="${x},${y} ${x + w},${y} ${x + w / 2},${tipY}" fill="${color}" stroke="${INK}" stroke-width="2"/>`;
  }
  return out;
}

// polka dots scattered across the card
let dots = "";
const dotColors = [RED, BLUE, YELLOW, PURPLE];
let seed = 7;
function rand() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
for (let i = 0; i < 46; i++) {
  const x = rand() * W;
  const y = 90 + rand() * (H - 180);
  const r = 5 + rand() * 9;
  const c = dotColors[i % dotColors.length];
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" opacity="0.16"/>`;
}

// a simple clown face built from shapes, no emoji glyph dependency
function clownFace(cx, cy, scale) {
  const s = scale;
  return `
  <g transform="translate(${cx},${cy}) scale(${s})">
    <!-- curly hair -->
    <circle cx="-78" cy="10" r="34" fill="${BLUE}" stroke="${INK}" stroke-width="5"/>
    <circle cx="-58" cy="-38" r="30" fill="${BLUE}" stroke="${INK}" stroke-width="5"/>
    <circle cx="78" cy="10" r="34" fill="${BLUE}" stroke="${INK}" stroke-width="5"/>
    <circle cx="58" cy="-38" r="30" fill="${BLUE}" stroke="${INK}" stroke-width="5"/>
    <!-- face -->
    <circle cx="0" cy="0" r="82" fill="${PAPER}" stroke="${INK}" stroke-width="6"/>
    <!-- hat -->
    <polygon points="-46,-64 46,-64 0,-190" fill="${PURPLE}" stroke="${INK}" stroke-width="6"/>
    <circle cx="0" cy="-198" r="16" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>
    <rect x="-58" y="-70" width="116" height="16" rx="6" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>
    <!-- eyes -->
    <circle cx="-30" cy="-8" r="8" fill="${INK}"/>
    <circle cx="30" cy="-8" r="8" fill="${INK}"/>
    <!-- nose -->
    <circle cx="0" cy="18" r="22" fill="${RED}" stroke="${INK}" stroke-width="5"/>
    <!-- smile -->
    <path d="M -42 36 Q 0 78 42 36" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  </g>`;
}

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  ${dots}
  ${scallops(0, true)}
  ${scallops(H, false)}

  <rect x="40" y="66" width="${W - 80}" height="${H - 132}" fill="none" stroke="${INK}" stroke-width="6" stroke-dasharray="2 22" stroke-linecap="round" rx="24"/>

  <text x="90" y="230" font-family="DejaVu Serif" font-weight="700" font-size="108" fill="${RED}" stroke="${INK}" stroke-width="3">HONK</text>
  <text x="90" y="335" font-family="DejaVu Serif" font-weight="700" font-size="108" fill="${BLUE}" stroke="${INK}" stroke-width="3">FEED</text>
  <text x="92" y="385" font-family="DejaVu Serif" font-weight="700" font-size="27" fill="${INK}">the rss reader that ran away</text>
  <text x="92" y="422" font-family="DejaVu Serif" font-weight="700" font-size="27" fill="${INK}">to join the circus</text>

  <rect x="88" y="452" width="470" height="60" rx="12" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>
  <text x="110" y="491" font-family="DejaVu Serif" font-weight="700" font-size="23" fill="${INK}">${esc("crud your feeds. honk the news.")}</text>

  ${clownFace(960, 330, 1.35)}
  <text x="960" y="560" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="24" fill="${PURPLE}">honkfeed.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [
      join(__dirname, "fonts/DejaVuSerif.ttf"),
      join(__dirname, "fonts/DejaVuSerif-Bold.ttf"),
    ],
    loadSystemFonts: false,
    defaultFontFamily: "DejaVu Serif",
  },
  background: PAPER,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log(`wrote public/og.png (${png.length} bytes)`);

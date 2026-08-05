// Generates public/og.png — the Open Graph preview card for hyperobject.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#050308", FG = "#f5f0ff", DIM = "#8b81a0";
const GOLD = "#ffd76a", GOLD2 = "#fff3d1";
const CARD = "#150e1e", BORDER = "#2c2238";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const sunCx = cardX + cardW / 2;
const sunCy = cardY + 130;

// a handful of small, dim, squished silhouettes piling up at the bottom of
// the card — "the pit" everyone else falls into.
const pitDots = [];
{
  const rows = [[0, 0], [1, 1], [-1, 1], [2, 2], [-2, 2], [0, 2], [1, 3], [-1, 3]];
  for (const [dx, row] of rows) {
    pitDots.push({ x: sunCx + dx * 58, y: cardY + 340 + row * 34, r: 15 + (row % 2) * 3 });
  }
}
const pitSvg = pitDots
  .map((d) => `<ellipse cx="${d.x}" cy="${d.y}" rx="${d.r}" ry="${d.r * 0.55}" fill="#332a42" stroke="${BORDER}" stroke-width="1.5"/>`)
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a1d0a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241a33"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sunglow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="${GOLD}" stop-opacity="0.12"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">hyperobject</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">isolyth.dev is on top.</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">you are not.</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">All the light touches is theirs.</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Everyone else gets cast into the</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">pit. Type a handle, watch them fall.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">hyperobject.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <circle cx="${sunCx}" cy="${sunCy}" r="150" fill="url(#sunglow)"/>
  <circle cx="${sunCx}" cy="${sunCy}" r="52" fill="${CARD}" stroke="${GOLD}" stroke-width="3"/>
  <text x="${sunCx}" y="${sunCy + 90}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${GOLD2}">@isolyth.dev</text>
  <text x="${sunCx}" y="${sunCy + 116}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" letter-spacing="2" fill="${GOLD}">THE HYPEROBJECT</text>

  ${pitSvg}
  <text x="${sunCx}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">everyone else, beneath</text>
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

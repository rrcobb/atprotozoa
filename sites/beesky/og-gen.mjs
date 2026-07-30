// Generates public/og.png — the Open Graph preview card for beesky, so a
// shared link auto-renders a picture of the honeycomb in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's dark amber/wax look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample hive (not tied to any real handle) — the static fallback
// card for the bare link. House style: self-contained, copy-don't-abstract,
// same recipe as sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0c0703", FG = "#ffefd0", DIM = "#c9a878", GOLD = "#ffcf5c", AMBER = "#c9862f";

function hexCorner(cx, cy, i, r) {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => hexCorner(cx, cy, i, r)).map((p) => p.join(",")).join(" ");
}
function axialToPixel(q, r, spacing) {
  return [spacing * Math.sqrt(3) * (q + r / 2), spacing * 1.5 * r];
}

// a little honeycomb cluster on the right half, spiralling out from a
// golden queen cell — same axial layout the live scene uses.
const originX = 860, originY = 320, spacing = 62, radius = 56;
const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const cells = [[0, 0]];
for (let ring = 1; ring <= 2; ring++) {
  let hex = [dirs[4][0] * ring, dirs[4][1] * ring];
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < ring; step++) {
      cells.push(hex);
      hex = [hex[0] + dirs[side][0], hex[1] + dirs[side][1]];
    }
  }
}

let honeycomb = "";
cells.forEach(([q, r], i) => {
  const [dx, dy] = axialToPixel(q, r, spacing);
  const cx = originX + dx, cy = originY + dy;
  if (cx < 520 || cx > 1160 || cy < 40 || cy > 590) return;
  const isQueen = i === 0;
  const fill = isQueen ? "url(#queenGrad)" : "url(#cellGrad)";
  const rr = isQueen ? radius * 1.15 : radius * 0.92;
  honeycomb += `<polygon points="${hexPoints(cx, cy, rr)}" fill="${fill}" stroke="${isQueen ? GOLD : "rgba(255,217,138,0.35)"}" stroke-width="${isQueen ? 3 : 1.5}"/>`;
  const dotR = isQueen ? 15 : 11;
  honeycomb += `<circle cx="${cx}" cy="${cy - rr * 0.15}" r="${dotR}" fill="rgba(20,12,4,0.55)"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="30%" r="65%">
      <stop offset="0" stop-color="#3a1e05"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="50%" r="70%">
      <stop offset="0" stop-color="#2a1608"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${AMBER}"/>
    </linearGradient>
    <radialGradient id="cellGrad" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="#7a4c1a"/>
      <stop offset="1" stop-color="#3a2308"/>
    </radialGradient>
    <radialGradient id="queenGrad" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="#ffe08a"/>
      <stop offset="1" stop-color="#c9862f"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  ${honeycomb}

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">beesky</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="23" fill="${DIM}">a 3D hive of your Bluesky <tspan fill="${GOLD}">mutuals</tspan></text>

  <text x="66" y="280" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Type a handle. Every moot becomes a</text>
  <text x="66" y="308" font-family="JetBrains Mono" font-size="18" fill="${DIM}">hexagonal wax cell in a honeycomb —</text>
  <text x="66" y="336" font-family="JetBrains Mono" font-size="18" fill="${DIM}">fly through it, WASD and a mouse drag.</text>
  <text x="66" y="364" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Your own cell glows gold at the centre.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${GOLD}">bisks.net/beesky</text>
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

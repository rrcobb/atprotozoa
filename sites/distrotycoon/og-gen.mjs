// Generates public/og.png — the Open Graph preview card for distrotycoon.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Same recipe as sites/honkfeed/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Roblox-style skin (requested by @lake.map-rust.com): a blocky mascot,
// chunky red-on-white sticker logo, checker-block backdrop. Per-result
// personalization still happens client-side in the share card canvas.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#dfe6ee", CHECK = "#eef2f7", INK = "#17181c", DIM = "#5b6472";
const RED = "#e2242a", GREEN = "#00b06f", GREEN_DK = "#007a4d", BLUE = "#00a2ff";

let checker = "";
for (let cx = -60; cx < W + 60; cx += 56) {
  for (let cy = -60; cy < H + 60; cy += 56) {
    if (((cx + cy) / 56) % 2 === 0) checker += `<rect x="${cx}" y="${cy}" width="28" height="28" fill="${CHECK}"/>`;
  }
}

const termX = 660, termY = 150, termW = 480, termH = 340;
const lines = [
  { t: "arguing on r/linux...    62%", c: GREEN_DK },
  { t: "arguing on hacker news...12%", c: INK },
  { t: "arguing on bluesky...    88%", c: GREEN_DK },
  { t: "have you tried the other init?", c: RED },
  { t: "ready to argue.", c: INK },
];
let termLines = "";
lines.forEach((l, i) => {
  const y = termY + 56 + i * 42;
  termLines += `<text x="${termX + 26}" y="${y}" font-family="DejaVu Serif" font-size="18" fill="${l.c}">${l.t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${checker}

  <text x="64" y="90" font-family="DejaVu Serif" font-weight="700" font-size="60" fill="${RED}" stroke="${INK}" stroke-width="4">distrotycoon</text>

  <!-- blocky roblox-ish mascot -->
  <g transform="translate(72, 130)">
    <rect x="22" y="0" width="52" height="42" rx="8" fill="#ffcc4d" stroke="${INK}" stroke-width="5"/>
    <circle cx="36" cy="20" r="4" fill="${INK}"/>
    <circle cx="60" cy="20" r="4" fill="${INK}"/>
    <rect x="8" y="42" width="80" height="58" rx="6" fill="${BLUE}" stroke="${INK}" stroke-width="5"/>
    <rect x="-14" y="46" width="22" height="50" rx="6" fill="#ffcc4d" stroke="${INK}" stroke-width="5"/>
    <rect x="90" y="46" width="22" height="50" rx="6" fill="#ffcc4d" stroke="${INK}" stroke-width="5"/>
    <rect x="18" y="100" width="26" height="46" rx="6" fill="#3a3a3a" stroke="${INK}" stroke-width="5"/>
    <rect x="54" y="100" width="26" height="46" rx="6" fill="#3a3a3a" stroke="${INK}" stroke-width="5"/>
  </g>

  <text x="64" y="360" font-family="DejaVu Serif" font-weight="700" font-size="21" fill="${INK}">build your own linux distro.</text>
  <text x="64" y="390" font-family="DejaVu Serif" font-weight="700" font-size="21" fill="${INK}">win the internet, one</text>
  <text x="64" y="420" font-family="DejaVu Serif" font-weight="700" font-size="21" fill="${INK}">comment section at a time.</text>

  <text x="64" y="470" font-family="DejaVu Serif" font-size="16" fill="${DIM}">phoronix · reddit</text>
  <text x="64" y="494" font-family="DejaVu Serif" font-size="16" fill="${DIM}">hacker news · x</text>
  <text x="64" y="518" font-family="DejaVu Serif" font-size="16" fill="${DIM}">mastodon · bluesky</text>

  <rect x="${termX + 8}" y="${termY + 8}" width="${termW}" height="${termH}" rx="16" fill="${INK}"/>
  <rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" rx="16" fill="#ffffff" stroke="${INK}" stroke-width="5"/>
  <circle cx="${termX + 28}" cy="${termY + 26}" r="7" fill="${RED}"/>
  <circle cx="${termX + 52}" cy="${termY + 26}" r="7" fill="#ffd400"/>
  <circle cx="${termX + 76}" cy="${termY + 26}" r="7" fill="${GREEN}"/>
  ${termLines}

  <text x="64" y="${H - 40}" font-family="DejaVu Serif" font-weight="700" font-size="24" fill="${BLUE}">distrotycoon.bisks.net</text>
</svg>`;

const fontDir = fileURLToPath(new URL("./fonts/", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: {
    fontFiles: [fontDir + "DejaVuSerif.ttf", fontDir + "DejaVuSerif-Bold.ttf"],
    loadSystemFonts: false,
    defaultFontFamily: "DejaVu Serif",
  },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

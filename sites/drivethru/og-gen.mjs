// Generates public/og.png — the Open Graph preview card for drivethru, so a
// shared link auto-renders a picture of the menu board in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Same recipe as sites/didscope/og-gen.mjs.
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

const ASPHALT = "#171512";
const RED = "#d81f26";
const RED_DARK = "#9e161b";
const YELLOW = "#ffcc02";
const CREAM = "#fff6e0";
const DIM = "#b7ac9a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a1414"/>
      <stop offset="1" stop-color="${ASPHALT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="8%" r="55%">
      <stop offset="0" stop-color="#3a2f00"/>
      <stop offset="1" stop-color="${ASPHALT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="board" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${RED}"/>
      <stop offset="1" stop-color="${RED_DARK}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${ASPHALT}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- sign board -->
  <rect x="60" y="60" width="${W - 120}" height="230" rx="18" fill="url(#board)" stroke="${YELLOW}" stroke-width="6"/>
  <text x="${W / 2}" y="160" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${YELLOW}">MICROSITE DRIVE-THRU</text>
  <text x="${W / 2}" y="210" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${CREAM}">pull up, place your order, drive off with a real website</text>
  <text x="${W / 2}" y="255" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${CREAM}" opacity="0.85">speak or type it → sign in with bluesky → @buildthis.bisks.net builds it</text>

  <!-- menu items -->
  <g font-family="JetBrains Mono">
    <text x="90" y="365" font-size="22" font-weight="700" fill="${YELLOW}">#1</text>
    <text x="140" y="365" font-size="22" fill="${CREAM}">THE CLASSIC COMBO — handle → trading card</text>

    <text x="90" y="415" font-size="22" font-weight="700" fill="${YELLOW}">#2</text>
    <text x="140" y="415" font-size="22" fill="${CREAM}">THE VALUE MEAL — mutual head-to-head, live</text>

    <text x="90" y="465" font-size="22" font-weight="700" fill="${YELLOW}">#3</text>
    <text x="140" y="465" font-size="22" fill="${CREAM}">LATE NIGHT SNACK — vibe check a feed</text>

    <text x="90" y="515" font-size="22" font-weight="700" fill="${YELLOW}">#5</text>
    <text x="140" y="515" font-size="22" fill="${CREAM}">SECRET MENU — off-menu, your call</text>
  </g>

  <text x="${W / 2}" y="590" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${YELLOW}">bisks.net/drivethru</text>
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

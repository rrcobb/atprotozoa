// Generates public/og.png — the Open Graph preview card for xbill. Same
// recipe as sites/backscroll/og-gen.mjs (copy, don't abstract): hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A taxi-meter style dollar readout in red/orange, ticking against a green
// "$0.00 here" line — the whole joke in one card.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0c0f0b", FG = "#f0f7ec", DIM = "#8a9a84", GREEN = "#7ee08a", RED = "#ff6a4d";

const cardX = 64, cardY = 300, cardW = 1072, cardH = 270;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="88%" cy="10%" r="55%">
      <stop offset="0" stop-color="#2a1410"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="6%" cy="95%" r="55%">
      <stop offset="0" stop-color="#0f2a16"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="${GREEN}">xbill</text>
  <text x="64" y="160" font-family="JetBrains Mono" font-size="24" fill="${DIM}">what would this cost on X?</text>

  <text x="64" y="220" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Your entire bsky repo, downloaded in one</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="19" fill="${DIM}">request — priced at X's own read-API rate</text>
  <text x="64" y="276" font-family="JetBrains Mono" font-size="19" fill="${DIM}">card: $5/1k posts, $10/1k profiles.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="#15110d" stroke="#3a2420" stroke-width="1.5"/>
  <text x="${cardX + 44}" y="${cardY + 56}" font-family="JetBrains Mono" font-weight="700" font-size="16" letter-spacing="1.5" fill="${DIM}">WOULD HAVE COST ON X</text>
  <text x="${cardX + 44}" y="${cardY + 150}" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${RED}">\$41.23</text>

  <text x="${cardX + 44}" y="${cardY + 200}" font-family="JetBrains Mono" font-weight="700" font-size="16" letter-spacing="1.5" fill="${GREEN}">ACTUAL COST HERE</text>
  <text x="${cardX + 44}" y="${cardY + 244}" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${GREEN}">\$0.00</text>
  <text x="${cardX + cardW - 44}" y="${cardY + 244}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${DIM}">one public request, no key, no bill</text>

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">xbill.bisks.net</text>
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

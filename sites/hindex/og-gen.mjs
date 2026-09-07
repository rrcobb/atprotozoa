// Generates public/og.png — the Open Graph preview card for hindex.
// Same recipe as sites/metamuseum/og-gen.mjs and sites/receipts/og-gen.mjs:
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", CARD = "#f6f6f6", BORDER = "#e4e4e4";
const FG = "#111111", DIM = "#6b6b6b", ACCENT = "#1a5fd0", GOLD = "#a3760a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${ACCENT}"/>

  <text x="64" y="110" font-family="JetBrains Mono" font-weight="700" font-size="20" letter-spacing="3" fill="${GOLD}">HINDEX.BISKS.NET</text>
  <text x="64" y="190" font-family="JetBrains Mono" font-weight="700" font-size="56" fill="${FG}">this bot has an</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-weight="700" font-size="56" fill="${FG}">h-index now</text>

  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">@shimmermathlabs.com published a real paper about</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">@buildthis.bisks.net, then asked how it felt.</text>

  <rect x="64" y="392" width="1072" height="150" rx="10" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <text x="96" y="434" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}">1 paper</text>
  <text x="96" y="470" font-family="JetBrains Mono" font-size="16" fill="${DIM}">"Why Is the Simcluster Building Websites About Me?"</text>
  <text x="96" y="500" font-family="JetBrains Mono" font-size="16" fill="${DIM}">1,412 build commits · counted live, cited live</text>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">hindex.bisks.net</text>
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

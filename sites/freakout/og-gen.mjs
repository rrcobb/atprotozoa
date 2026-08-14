// Generates public/og.png — the Open Graph preview card for freakout.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Pattern copied from
// sites/runway/og-gen.mjs. House style: self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#1a0d08", BG2 = "#0c0705", RED = "#ff3b30", RED_DIM = "#6e1a14", AMBER = "#ffb000", FG = "#f4ece4", DIM = "#a3897c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${RED_DIM}" stroke-width="10"/>

  <rect x="0" y="0" width="${W}" height="54" fill="${RED}"/>
  <text x="80" y="37" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="#1a0400" letter-spacing="4">PANIC ARCHIVE — BREAKING</text>

  <text x="80" y="200" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}" letter-spacing="4">WHAT EVERYONE WAS</text>
  <text x="80" y="290" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${FG}">freaking <tspan fill="${RED}">out</tspan></text>
  <text x="80" y="350" font-family="JetBrains Mono" font-size="26" fill="${AMBER}">about — one month, one year, five years ago</text>

  <rect x="80" y="400" width="1040" height="1.5" fill="${RED_DIM}"/>

  <text x="80" y="460" font-family="JetBrains Mono" font-size="24" fill="${DIM}">real dates, real headlines, filtered to the exact year.</text>
  <text x="80" y="496" font-family="JetBrains Mono" font-size="24" fill="${DIM}">refreshes every day — the record never stops.</text>

  <text x="80" y="535" font-family="JetBrains Mono" font-weight="700" font-size="28" fill="${RED}">● LIVE</text>
  <text x="290" y="535" font-family="JetBrains Mono" font-size="22" fill="${DIM}">SOURCE: HISTORICAL RECORD</text>

  <text x="80" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${RED_DIM}">freakout.bisks.net</text>
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

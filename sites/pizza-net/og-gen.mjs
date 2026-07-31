// Generates public/og.png — the Open Graph preview card for pizza-net, a fan
// recreation of the fictional pizza-ordering site from The Net (1995).
// Hand-drawn SVG, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium needed; this box has no fontconfig either, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (copied from
// sites/didscope/og-gen.mjs and re-themed). Re-run by hand after art changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const TEAL = "#006666", TEAL2 = "#004d4d", RED = "#b30000", YELLOW = "#ffcc00";
const FG = "#ffffff", CARD = "#ffffff", INK = "#111111", DIM = "#444444";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 90, cardY = 90, cardW = 1020, cardH = 450;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="diag" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="16" height="16" fill="${TEAL}"/>
      <rect width="8" height="16" fill="${TEAL2}"/>
    </pattern>
    <pattern id="hazard" width="30" height="30" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="30" height="30" fill="${YELLOW}"/>
      <rect width="15" height="30" fill="${INK}"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#diag)"/>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${CARD}" stroke="${INK}" stroke-width="6"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="16" fill="url(#hazard)"/>
  <rect x="${cardX}" y="${cardY + cardH - 16}" width="${cardW}" height="16" fill="url(#hazard)"/>

  <text x="${W / 2}" y="260" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="${RED}">pizza.net</text>
  <text x="${W / 2}" y="316" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}" font-style="italic">"the pizza's on its way... over the modem"</text>

  <text x="${W / 2}" y="380" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${INK}">a fan recreation of the ordering page from</text>
  <text x="${W / 2}" y="410" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">THE NET (1995)</text>

  <rect x="${cardX + 60}" y="440" width="${cardW - 120}" height="60" fill="${INK}"/>
  <text x="${W / 2}" y="478" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${YELLOW}">&gt;&gt; PLACE YOUR ORDER ON THE INFORMATION SUPERHIGHWAY &lt;&lt;</text>

  <text x="${W / 2}" y="590" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${FG}">pizza-net.bisks.net</text>
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

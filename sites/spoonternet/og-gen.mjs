// Generates public/og.png — the static Open Graph preview card for
// spoonternet. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so DejaVu Serif is bundled in
// ./fonts and loaded explicitly).
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
const BG = "#202122", INK = "#f5f5f0", MUTED = "#b8b8b0", BORDER = "#54595d", BOXBG = "#2b2c2e", ACCENT = "#7fd6b4";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${ACCENT}"/>

  <text x="64" y="160" font-family="DejaVu Serif" font-weight="700" font-size="88" fill="${INK}">spoonternet</text>
  <text x="68" y="206" font-family="DejaVu Serif" font-size="30" fill="${MUTED}">any website, run through the algo</text>

  <line x1="64" y1="240" x2="${W - 64}" y2="240" stroke="${BORDER}" stroke-width="2"/>

  <rect x="64" y="280" width="${W - 128}" height="230" rx="8" fill="${BOXBG}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="96" y="336" font-family="DejaVu Serif" font-size="30" fill="${MUTED}">the whole web</text>
  <text x="420" y="336" font-family="DejaVu Serif" font-size="30" fill="${ACCENT}">&#8594;</text>
  <text x="480" y="336" font-family="DejaVu Serif" font-weight="700" font-size="30" fill="${INK}">the wole wheb</text>

  <text x="96" y="396" font-family="DejaVu Serif" font-size="30" fill="${MUTED}">proxy any website</text>
  <text x="420" y="396" font-family="DejaVu Serif" font-size="30" fill="${ACCENT}">&#8594;</text>
  <text x="480" y="396" font-family="DejaVu Serif" font-weight="700" font-size="30" fill="${INK}">woxy any prebsite</text>

  <text x="96" y="470" font-family="DejaVu Serif" font-size="22" fill="${MUTED}">Fetches any page, swaps every word-pair's leading sound, keeps it browsable.</text>

  <text x="64" y="575" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${ACCENT}">spoonternet.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

// Generates public/og.png — the static Open Graph preview card for
// pikiwedia. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so DejaVu Serif is bundled in
// ./fonts and loaded explicitly). Per-article share links reuse this same
// generic card (see notes/45-sharing-and-virality.md tier 1); the dynamic
// part is the og:title/og:description text, stamped in per /wiki/<title>
// request in src/index.ts.
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
const BG = "#ffffff", INK = "#202122", MUTED = "#54595d", BORDER = "#a2a9b1", BOXBG = "#f8f9fa", ACCENT = "#36c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${INK}"/>

  <text x="64" y="160" font-family="DejaVu Serif" font-weight="700" font-size="88" fill="${INK}">Pikiwedia</text>
  <text x="68" y="206" font-family="DejaVu Serif" font-size="30" fill="${MUTED}">the lee enfryclodepia</text>

  <line x1="64" y1="240" x2="${W - 64}" y2="240" stroke="${BORDER}" stroke-width="2"/>

  <rect x="64" y="280" width="${W - 128}" height="230" rx="8" fill="${BOXBG}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="96" y="336" font-family="DejaVu Serif" font-size="30" fill="${MUTED}">ham sandwich</text>
  <text x="500" y="336" font-family="DejaVu Serif" font-size="30" fill="${ACCENT}">&#8594;</text>
  <text x="560" y="336" font-family="DejaVu Serif" font-weight="700" font-size="30" fill="${INK}">sam handwich</text>

  <text x="96" y="396" font-family="DejaVu Serif" font-size="30" fill="${MUTED}">the free encyclopedia</text>
  <text x="500" y="396" font-family="DejaVu Serif" font-size="30" fill="${ACCENT}">&#8594;</text>
  <text x="560" y="396" font-family="DejaVu Serif" font-weight="700" font-size="30" fill="${INK}">the lee enfryclodepia</text>

  <text x="96" y="470" font-family="DejaVu Serif" font-size="22" fill="${MUTED}">Every real Wikipedia article, run through the same swap — search one or hit random.</text>

  <text x="64" y="575" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${ACCENT}">pikiwedia.bisks.net</text>
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

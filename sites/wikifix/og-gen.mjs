// Generates public/og.png — the Open Graph preview card for wikifix. Hand-
// drawn SVG at the canonical OG size, matching the live page's look,
// rasterised with @resvg/resvg-js (no system fonts on this box — the font
// is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. See sites/didscope/og-gen.mjs for the reference.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d1310", CARD = "#142019", BORDER = "#24382c";
const FG = "#eef5ef", DIM = "#86a091", ACCENT = "#4fe08a";

const cardX = 60, cardY = 200, cardW = W - 120, cardH = H - 270;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#12321f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="110" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${FG}">wiki<tspan fill="${ACCENT}">fix</tspan></text>
  <text x="60" y="148" font-family="JetBrains Mono" font-size="20" fill="${DIM}">correcting all errors in Wikipedia</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${W / 2}" y="${cardY + 60}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">ERRORS CORRECTED SO FAR</text>
  <text x="${W / 2}" y="${cardY + 150}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="${ACCENT}">1,248,391,027</text>
  <text x="${W / 2}" y="${cardY + 200}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">now fixing: List of highest mountains on Earth</text>

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/wikifix</text>
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

// Generates public/og.png — the static Open Graph preview card for
// Splicepedia. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (no system fonts in this box, so DejaVu Serif is bundled in
// ./fonts and loaded explicitly). Copied and trimmed from
// sites/pikiwedia/og-gen.mjs, same Wikipedia-parody palette.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#202122", MUTED = "#54595d", BORDER = "#a2a9b1", BOXBG = "#f8f9fa";
const RED = "#ab1f24", GOLD = "#b8710a", BLUE = "#0645ad";

const stitches = [
  { text: "The reign of Empress Xu Pingjun ended abruptly in 71 BC.", tag: "from “Empress Xu Pingjun”", color: BLUE },
  { text: "It is now considered a keystone species in wetland restoration.", tag: "from “North American beaver”", color: RED },
  { text: "It was later adapted into a widely exported instant noodle format.", tag: "from “Kimchi-jjigae”", color: GOLD },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = stitches
  .map((s, i) => {
    const y = 316 + i * 68;
    return `
    <text x="96" y="${y}" font-family="DejaVu Serif" font-size="23" fill="${INK}">${esc(s.text)}</text>
    <text x="96" y="${y + 26}" font-family="DejaVu Serif" font-weight="700" font-size="15" fill="${s.color}">${esc(s.tag)}</text>
    ${i < stitches.length - 1 ? `<line x1="96" y1="${y + 42}" x2="${W - 96}" y2="${y + 42}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="4 5"/>` : ""}`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${INK}"/>

  <text x="64" y="150" font-family="DejaVu Serif" font-weight="700" font-size="80" fill="${INK}">Splicepedia</text>
  <text x="68" y="192" font-family="DejaVu Serif" font-size="26" fill="${MUTED}">the encyclopedia that lies with only true sentences</text>

  <line x1="64" y1="222" x2="${W - 64}" y2="222" stroke="${BORDER}" stroke-width="2"/>

  <rect x="64" y="255" width="${W - 128}" height="245" rx="8" fill="${BOXBG}" stroke="${BORDER}" stroke-width="1.5"/>
  ${rows}

  <text x="96" y="536" font-family="DejaVu Serif" font-size="20" fill="${MUTED}">Every sentence is real. None of them belong together. Click “show stitches” to see the seams.</text>

  <text x="64" y="590" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${RED}">splicepedia.bisks.net</text>
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

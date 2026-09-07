// Generates public/og.png — the Open Graph preview card for knowyourmuseum.
// Same recipe as sites/museum/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#f1ede1", CARD = "#fbf9f1", BORDER = "#8a9178";
const DIM = "#6b6a58", ACCENT = "#2f6b4e", BRASS = "#96742f", VELVET = "#1f4436";

const galleries = [
  { label: "THE FOLK WEB", years: "1996–2007", n: 2 },
  { label: "THE MACRO AGE", years: "2007–2013", n: 5 },
  { label: "THE LIVING MEME", years: "2013–present", n: 4 },
];

const plaqueX = 680, plaqueY = 100, plaqueW = 456, plaqueH = 440;
const rowsSvg = galleries
  .map((g, i) => {
    const ry = plaqueY + 100 + i * 130;
    return `
    <text x="${plaqueX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="18" letter-spacing="1.5" fill="${VELVET}">${g.label}</text>
    <text x="${plaqueX + 40}" y="${ry + 26}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">${g.years}</text>
    <text x="${plaqueX + plaqueW - 40}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="19" fill="${BRASS}">${g.n} pieces</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${BRASS}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${BRASS}"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="700" font-size="24" letter-spacing="4" fill="${BRASS}">BISKS.NET PRESENTS</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-weight="700" font-size="50" fill="${VELVET}">Know Your</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-weight="700" font-size="50" fill="${VELVET}">Museum</text>

  <text x="64" y="328" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Know Your Meme, treated with the</text>
  <text x="64" y="354" font-family="JetBrains Mono" font-size="16" fill="${DIM}">reverence of a museum: provenance,</text>
  <text x="64" y="380" font-family="JetBrains Mono" font-size="16" fill="${DIM}">tradition, and critical reception.</text>

  <text x="64" y="470" font-family="JetBrains Mono" font-size="17" fill="${ACCENT}">11 pieces on display</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${VELVET}">knowyourmuseum.bisks.net</text>

  <rect x="${plaqueX}" y="${plaqueY}" width="${plaqueW}" height="${plaqueH}" rx="4" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <text x="${plaqueX + 40}" y="${plaqueY + 50}" font-family="JetBrains Mono" font-weight="700" font-size="17" letter-spacing="2" fill="${DIM}">GALLERIES, BY ERA</text>

  ${rowsSvg}
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

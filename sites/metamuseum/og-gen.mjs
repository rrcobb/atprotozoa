// Generates public/og.png — the Open Graph preview card for metamuseum.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#f2ede3", CARD = "#fbf8f1", BORDER = "#a89a72";
const FG = "#2a2420", DIM = "#6d6250", ACCENT = "#7a3b2e", BRASS = "#96742f", VELVET = "#4a1f2e";

const institutions = JSON.parse(readFileSync(new URL("./public/data/institutions.json", import.meta.url)));

const plaqueX = 680, plaqueY = 80, plaqueW = 456, plaqueH = 480;
const rowsSvg = institutions
  .slice(0, 6)
  .map((inst, i) => {
    const ry = plaqueY + 70 + i * 68;
    return `
    <text x="${plaqueX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${VELVET}">${inst.title.toUpperCase()}</text>
    <text x="${plaqueX + 40}" y="${ry + 24}" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${inst.kind}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${BRASS}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${BRASS}"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="700" font-size="26" letter-spacing="4" fill="${BRASS}">BISKS.NET PRESENTS</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-weight="700" font-size="52" fill="${VELVET}">the metamuseum</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-weight="700" font-size="52" fill="${VELVET}">of the internet</text>

  <text x="64" y="328" font-family="JetBrains Mono" font-size="16" fill="${DIM}">A museum that lists other museums,</text>
  <text x="64" y="354" font-family="JetBrains Mono" font-size="16" fill="${DIM}">and only that. The toys moved out to</text>
  <text x="64" y="380" font-family="JetBrains Mono" font-size="16" fill="${DIM}">an actual museum. This is the annex.</text>

  <text x="64" y="470" font-family="JetBrains Mono" font-size="17" fill="${ACCENT}">${institutions.length} museums in the constellation</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${VELVET}">metamuseum.bisks.net</text>

  <rect x="${plaqueX}" y="${plaqueY}" width="${plaqueW}" height="${plaqueH}" rx="4" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <text x="${plaqueX + 40}" y="${plaqueY + 50}" font-family="JetBrains Mono" font-weight="700" font-size="17" letter-spacing="2" fill="${DIM}">THE ANNEX</text>

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

// Generates public/og.png — the Open Graph preview card for apocrypha.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Copied and trimmed from
// sites/monument/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const WALL = "#241111", WALL_2 = "#170a0a";
const PLAQUE = "#f4ecdc", INK = "#241a10", INK_SOFT = "#5a4a37";
const BRASS = "#c9a15b", BRASS_BRIGHT = "#e6c785", BRASS_DEEP = "#8a6a30";
const OXBLOOD = "#5c1a1a";

const cx = W / 2;
const cardX = 300, cardY = 148, cardW = 600, cardH = 400;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="wallglow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="#3a1a1a"/>
      <stop offset="1" stop-color="${WALL_2}"/>
    </radialGradient>
    <linearGradient id="gilt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BRASS_BRIGHT}"/>
      <stop offset="0.6" stop-color="${BRASS}"/>
      <stop offset="1" stop-color="${BRASS_DEEP}"/>
    </linearGradient>
    <linearGradient id="plaquefill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8f1e3"/>
      <stop offset="1" stop-color="${PLAQUE}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${WALL}"/>
  <rect width="${W}" height="${H}" fill="url(#wallglow)"/>

  <text x="${cx}" y="72" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="20" letter-spacing="10" fill="${BRASS}">THE PERMANENT COLLECTION</text>
  <text x="${cx}" y="132" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="60" letter-spacing="4" fill="url(#gilt)">APOCRYPHA</text>

  <!-- gilt frame -->
  <rect x="${cardX - 14}" y="${cardY - 14}" width="${cardW + 28}" height="${cardH + 28}" fill="none" stroke="url(#gilt)" stroke-width="10"/>
  <rect x="${cardX - 4}" y="${cardY - 4}" width="${cardW + 8}" height="${cardH + 8}" fill="none" stroke="${BRASS_DEEP}" stroke-width="2"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#plaquefill)"/>

  <circle cx="${cx}" cy="${cardY + 66}" r="46" fill="${BRASS_DEEP}" opacity="0.18"/>
  <circle cx="${cx}" cy="${cardY + 66}" r="46" fill="none" stroke="url(#gilt)" stroke-width="4"/>
  <text x="${cx}" y="${cardY + 78}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="38" fill="${BRASS_DEEP}">?</text>

  <text x="${cx}" y="${cardY + 148}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="22" letter-spacing="2" fill="${INK}">SOME ESTEEMED PHILOSOPHER</text>
  <text x="${cx}" y="${cardY + 178}" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="14" fill="${INK_SOFT}">probably said something wise once</text>

  <text x="${cx}" y="${cardY + 236}" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="26" fill="${INK}">"posted at 2am, mistaken for scripture"</text>

  <line x1="${cardX + 60}" y1="${cardY + 280}" x2="${cardX + cardW - 60}" y2="${cardY + 280}" stroke="${BRASS_DEEP}" stroke-dasharray="4 5" stroke-width="1.5"/>
  <text x="${cx}" y="${cardY + 314}" text-anchor="middle" font-family="DejaVu Serif" font-size="15" fill="${OXBLOOD}">CURATOR'S NOTE — actually posted by @you, probably</text>
  <text x="${cx}" y="${cardY + 342}" text-anchor="middle" font-family="DejaVu Serif" font-size="15" fill="${INK_SOFT}">everyone who has ever tagged @buildthis, misattributed on brass</text>

  <text x="${cx}" y="${H - 40}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="24" letter-spacing="1" fill="${BRASS_BRIGHT}">apocrypha.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

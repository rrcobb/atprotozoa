// Generates public/og.png — the Open Graph preview card for runnerup.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/hyperobject/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0c10", FG = "#eef1f5", DIM = "#8892a0";
const SILVER = "#c9d4e0", SILVER2 = "#f2f6fa", GOLD = "#e8c766";
const CARD = "#151a21", BORDER = "#262f3a";

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const colW = (cardW - 24) / 2;
const goldX = cardX + 8;
const silverX = cardX + 16 + colW;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#161c24"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#1a212b"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="silverglow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${SILVER}" stop-opacity="0.45"/>
      <stop offset="0.5" stop-color="${SILVER}" stop-opacity="0.1"/>
      <stop offset="1" stop-color="${SILVER}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${SILVER}"/>
      <stop offset="1" stop-color="${SILVER2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">runnerup</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">@mfzx.net is permanently</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">2nd place.</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">1st is already taken. mfzx.net has</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">2nd locked down forever. everyone</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">else climbs for 3rd and below.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${SILVER}">runnerup.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <!-- gold: vacant -->
  <rect x="${goldX}" y="${cardY + 24}" width="${colW}" height="${cardH - 48}" rx="12" fill="#171208" stroke="#3a3020" stroke-width="1.25"/>
  <circle cx="${goldX + colW / 2}" cy="${cardY + 82}" r="28" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="6 6" opacity="0.7"/>
  <text x="${goldX + colW / 2}" y="${cardY + 90}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${GOLD}" opacity="0.7">1</text>
  <text x="${goldX + colW / 2}" y="${cardY + 138}" text-anchor="middle" font-family="JetBrains Mono" font-size="12" letter-spacing="1.5" fill="${GOLD}">1ST — VACANT</text>
  <text x="${goldX + colW / 2}" y="${cardY + 166}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="${DIM}">spoken for at</text>
  <text x="${goldX + colW / 2}" y="${cardY + 184}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="${DIM}">hyperobject.bisks.net</text>

  <!-- silver: mfzx.net -->
  <rect x="${silverX}" y="${cardY + 24}" width="${colW}" height="${cardH - 48}" rx="12" fill="#1c222b" stroke="#3a4552" stroke-width="1.5"/>
  <circle cx="${silverX + colW / 2}" cy="${cardY + 82}" r="46" fill="url(#silverglow)"/>
  <circle cx="${silverX + colW / 2}" cy="${cardY + 82}" r="30" fill="${CARD}" stroke="${SILVER}" stroke-width="3"/>
  <text x="${silverX + colW / 2}" y="${cardY + 90}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${SILVER2}">2</text>
  <text x="${silverX + colW / 2}" y="${cardY + 162}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${SILVER2}">@mfzx.net</text>
  <text x="${silverX + colW / 2}" y="${cardY + 184}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" letter-spacing="1.5" fill="${SILVER}">2ND — FOREVER</text>

  <text x="${cardX + cardW / 2}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">everyone else climbs for 3rd, below</text>
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

// Generates public/og.png — the Open Graph preview card for BLASTWELL.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Mirrors sites/slopwater's recipe.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (not tied to any real playthrough) — the static
// fallback for the bare link. Per-run share cards are generated live,
// client-side, in public/index.html (buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#050912", FG = "#eafffb", DIM = "#85a0a8";
const TEAL = "#17e6d0", MAGENTA = "#ff2e88", LIME = "#c6ff2e";
const CARD = "#0c1622", BORDER = "#1c3040";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 760, cardY = 60, cardW = 380, cardH = 510;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="85%" cy="12%" r="60%">
      <stop offset="0" stop-color="rgba(23,230,208,0.22)"/>
      <stop offset="1" stop-color="rgba(5,9,18,0)"/>
    </radialGradient>
    <radialGradient id="glow2" cx="10%" cy="90%" r="55%">
      <stop offset="0" stop-color="rgba(255,46,136,0.18)"/>
      <stop offset="1" stop-color="rgba(5,9,18,0)"/>
    </radialGradient>
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${TEAL}"/>
      <stop offset="0.55" stop-color="${MAGENTA}"/>
      <stop offset="1" stop-color="${LIME}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#titleGrad)">BLASTWELL</text>
  <text x="60" y="158" font-family="JetBrains Mono" font-size="21" fill="${DIM}">whack it. shake it. climb it.</text>

  <text x="60" y="240" font-family="JetBrains Mono" font-size="19" fill="${FG}">${esc("hellmole's whack-a-mole + slopwater's shake-for-your-")}</text>
  <text x="60" y="270" font-family="JetBrains Mono" font-size="19" fill="${FG}">${esc("life + babel's climb-and-confound tower, one fountain.")}</text>
  <text x="60" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">${esc("the bot picked all three itself this time.")}</text>

  <text x="60" y="${H - 50}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${LIME}">blastwell.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <rect x="${cardX + 24}" y="${cardY + 24}" width="${cardW - 48}" height="90" rx="12" fill="${TEAL}"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 76}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="#04120f">DRIVE-THRU LEGEND</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 180}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">340 pts</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 208}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">this shift</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 270}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${MAGENTA}">RADIOACTIVE</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 300}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">180 ft on the Tower of Blast (permanent)</text>

  <text x="${cardX + cardW / 2}" y="${cardY + cardH - 44}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc("picked and built by the bot itself,")}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + cardH - 24}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc("for @cee.wtf.")}</text>
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

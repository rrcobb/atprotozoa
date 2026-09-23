// Generates public/og.png — the Open Graph preview card for elopt.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/hyperobject/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0c10", FG = "#eef1f5", DIM = "#8b93a1";
const ACCENT = "#6ee7b7", ACCENT2 = "#93c5fd";
const CARD = "#12151b", BORDER = "#262c36";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="#0f2a22"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">elopt</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">elo, but only for people who consent.</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="18" fill="${FG}">nobody's named, battled, or ranked here</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="18" fill="${FG}">unless they opted themselves in.</text>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">elopt.bisks.net</text>

  <rect x="700" y="90" width="430" height="440" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <circle cx="850" cy="230" r="58" fill="${CARD}" stroke="${ACCENT}" stroke-width="3"/>
  <text x="850" y="238" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${ACCENT}">A</text>
  <text x="1030" y="230" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">vs</text>
  <circle cx="1030" cy="290" r="58" fill="${CARD}" stroke="${ACCENT2}" stroke-width="3"/>
  <text x="1030" y="298" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${ACCENT2}">B</text>
  <text x="915" y="420" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">both opted in.</text>
  <text x="915" y="444" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">you call the winner.</text>
  <text x="915" y="490" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${ACCENT}">+16 elo</text>
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

// Generates public/og.png — the static Open Graph preview card for
// moodmatch, so a bare link unfurls as a real thing in Bluesky / other
// unfurlers. Hand-drawn SVG matching the live page's palette, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed —
// this box has no fontconfig/system fonts either, so the font is bundled
// in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Per-match share cards are generated live, client-side, in
// public/app.js (buildShareCard) — this is just the generic fallback.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#100a17", GLOW = "#2a1640", FG = "#f4ecff", DIM = "#a998c4";
const ACCENT = "#ff5fa8", ACCENT2 = "#6ef2c9", CARD = "#191026", BORDER = "#362450";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-10%" r="70%">
      <stop offset="0" stop-color="${GLOW}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="${W / 2}" y="170" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="url(#title)">moodmatch</text>
  <text x="${W / 2}" y="222" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${DIM}">two names, two songs, two moods → one shared playlist</text>

  <text x="${W / 2 - 220}" y="330" text-anchor="middle" font-size="110">🌱</text>
  <text x="${W / 2}" y="320" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${FG}">+</text>
  <text x="${W / 2 + 220}" y="330" text-anchor="middle" font-size="110">😌</text>

  <rect x="${W / 2 - 320}" y="410" width="640" height="150" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${W / 2}" y="470" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${FG}">78%</text>
  <text x="${W / 2}" y="510" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">genuinely well-matched</text>
  <text x="${W / 2}" y="540" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${DIM}">sample match · yours will differ</text>

  <text x="${W / 2}" y="605" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">moodmatch.bisks.net</text>
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

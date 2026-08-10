// Generates public/og.png — the Open Graph preview card for favoritism, so a
// shared link auto-renders a picture of the scoreboard in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample scoreboard (not tied to any real handles) — this is the
// static fallback card for the bare link. Per-pair share cards are generated
// live, client-side, in public/index.html (buildShareCard); per-pair share
// links get their own personalized og:title/og:description via src/index.ts.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0910", FG = "#f3eefc", DIM = "#9a90b0";
const ACCENT = "#ff4d8d", ACCENT2 = "#ffb84c", CARD = "#14111d", BORDER = "#2a2438";
const SIDE_A = "#5ad1ff", SIDE_B = "#ff4d8d";

const nAtoB = 41, nBtoA = 17;

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const avR = 42, avY = cardY + 90, avLX = cardX + 140, avRX = cardX + cardW - 140;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a0d3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0d1f3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">favoritism</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">who likes who more?</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Two Bluesky handles in. Every</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${DIM}">like each side has ever given the</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${DIM}">other, counted and laid out side</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="17" fill="${DIM}">by side, with thread context.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">favoritism.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <circle cx="${avLX}" cy="${avY}" r="${avR}" fill="${BG}" stroke="${SIDE_A}" stroke-width="2.5"/>
  <circle cx="${avRX}" cy="${avY}" r="${avR}" fill="${BG}" stroke="${SIDE_B}" stroke-width="2.5"/>
  <text x="${avLX}" y="${avY + 9}" text-anchor="middle" font-family="JetBrains Mono" font-size="30" fill="${DIM}">?</text>
  <text x="${avRX}" y="${avY + 9}" text-anchor="middle" font-family="JetBrains Mono" font-size="30" fill="${DIM}">?</text>

  <text x="${cardX + cardW * 0.28}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="110" fill="${SIDE_A}">${nAtoB}</text>
  <text x="${cardX + cardW * 0.5}" y="${cardY + 232}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${ACCENT2}">&gt;</text>
  <text x="${cardX + cardW * 0.72}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="110" fill="${SIDE_B}">${nBtoA}</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 300}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${DIM}">LIKES GIVEN, EACH DIRECTION</text>

  <rect x="${cardX + 60}" y="${cardY + 340}" width="${cardW - 120}" height="14" rx="7" fill="${BG}" stroke="${BORDER}"/>
  <rect x="${cardX + 60}" y="${cardY + 340}" width="${((cardW - 120) * nAtoB) / (nAtoB + nBtoA)}" height="14" rx="7" fill="${SIDE_A}"/>
  <rect x="${cardX + 60 + ((cardW - 120) * nAtoB) / (nAtoB + nBtoA)}" y="${cardY + 340}" width="${(cardW - 120) * (1 - nAtoB / (nAtoB + nBtoA))}" height="14" rx="7" fill="${SIDE_B}"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 420}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${FG}">every liked post shown side by side,</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 448}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${FG}">with reply context</text>
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

// Generates public/og.png — the Open Graph preview card for brokenrecord.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). A generic sample (not tied to
// any real handle) — per-handle share cards are generated live, client-side,
// in public/app.js (buildShareCard).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0908";
const FG = "#f5efe6", DIM = "#a89a86";
const ACCENT = "#ff5c3d", ACCENT2 = "#ffd23f";
const CARD = "#17130f", CARD2 = "#1e1a14", BORDER = "#332a1f";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const postA = "the ocean is just a big bathtub, no notes";
const postB = "unpopular opinion: ocean = big bathtub. no notes";
const dateA = "Feb 11, 2026";
const dateB = "Jul 30, 2026";

const cardX = 470, cardY = 58, cardW = 674, cardH = 514;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1608"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a2005"/>
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

  <text x="64" y="132" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="url(#title)">brokenrecord</text>
  <text x="64" y="180" font-family="JetBrains Mono" font-size="20" fill="${DIM}">enter a handle, find out what</text>
  <text x="64" y="208" font-family="JetBrains Mono" font-size="20" fill="${DIM}">they keep repeating</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Downloads the whole repo, clusters</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="16" fill="${DIM}">near-duplicates, paraphrases, reused</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="16" fill="${DIM}">jokes and stories — ranked by echo.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">brokenrecord.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 60}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${ACCENT2}">87%</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 94}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">SELF-ECHO MATCH</text>

  <rect x="${cardX + 40}" y="${cardY + 128}" width="${cardW - 80}" height="118" rx="12" fill="${CARD2}" stroke="${BORDER}"/>
  <text x="${cardX + 62}" y="${cardY + 164}" font-family="JetBrains Mono" font-size="17" fill="${FG}">“${esc(postA)}”</text>
  <text x="${cardX + 62}" y="${cardY + 220}" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${dateA}</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 270}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${ACCENT}">↕</text>

  <rect x="${cardX + 40}" y="${cardY + 286}" width="${cardW - 80}" height="118" rx="12" fill="${CARD2}" stroke="${BORDER}"/>
  <text x="${cardX + 62}" y="${cardY + 322}" font-family="JetBrains Mono" font-size="17" fill="${FG}">“${esc(postB)}”</text>
  <text x="${cardX + 62}" y="${cardY + 378}" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${dateB}</text>
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

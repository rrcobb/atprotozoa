// Generates public/og.png — the Open Graph preview card for labelmuster.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Copied and adapted from
// sites/blocksweep/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic card, not tied to any real scan — the actual result (which
// label, how many mustered) gets its own personalized card via
// src/index.ts's /summary/ route reusing this same static image, same
// tradeoff as blocksweep/innercircle.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d1210", FG = "#e4f2ea", DIM = "#88a69a";
const ACCENT = "#5ce0a0", ACCENT2 = "#83ffcf";
const CARD = "#141b18", BORDER = "#243a30", PANEL2 = "#1a231f";

const rows = [
  { name: "Noldor", count: "14 mustered" },
  { name: "self-applied", count: "8 mustered" },
  { name: "bot", count: "3 mustered" },
  { name: "porn", count: "1 mustered" },
];

const rowsSvg = rows.map((r, i) => {
  const y = 128 + i * 76;
  return `
    <rect x="694" y="${y - 24}" width="12" height="12" rx="3" fill="${ACCENT}" opacity="0.85"/>
    <text x="726" y="${y - 6}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${FG}">${r.name}</text>
    <rect x="1010" y="${y - 22}" width="140" height="32" rx="8" fill="${ACCENT}22" stroke="${ACCENT}" stroke-width="1.3"/>
    <text x="1080" y="${y - 1}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${ACCENT}">${r.count}</text>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1a3327"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">🏷️ labelmuster</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">scan an account's labels, pick</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">one, and find everyone nearby</text>
  <text x="64" y="244" font-family="JetBrains Mono" font-size="21" fill="${DIM}">who carries it too.</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Self-applied flags and moderation</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="17" fill="${DIM}">labels both — straight off the</text>
  <text x="64" y="382" font-family="JetBrains Mono" font-size="17" fill="${DIM}">public AppView, no login needed.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">labelmuster.bisks.net</text>

  <rect x="670" y="70" width="470" height="480" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="702" y="112" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${DIM}">labels found near @you</text>
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

// Generates public/og.png — the Open Graph preview card for mobiusmatch, so
// a shared link auto-renders a picture of the quiz in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is the static fallback card for the bare link, showing the category
// wheel rather than any one match. Per-match share cards are generated live,
// client-side, in public/index.html (buildShareCard), and the /s/<key>
// worker route (src/index.ts) stamps per-match title/description text (but
// reuses this same static image — 42 distinct card images was more render
// budget than this quiz needs).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070a0f", FG = "#eaf3f3", DIM = "#7d94a0";
const ACCENT = "#37e2c4", ACCENT2 = "#6ea8ff", CARD = "#101a26", BORDER = "#223140";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CATEGORIES = [
  "Generators", "Lenses on Bluesky", "The O'Neill Cylinder", "Fiction & Lore",
  "Math & Science", "Tools That Built It", "Games & Play",
];

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const rowH = cardH / CATEGORIES.length;

const rows = CATEGORIES.map((label, i) => {
  const y = cardY + i * rowH;
  const mid = y + rowH / 2 + 8;
  return `
    <rect x="${cardX}" y="${y}" width="${cardW}" height="${rowH}" fill="${i % 2 === 0 ? CARD : "#0d1720"}" />
    <circle cx="${cardX + 40}" cy="${mid - 8}" r="5" fill="${i % 2 === 0 ? ACCENT : ACCENT2}" />
    <text x="${cardX + 64}" y="${mid}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FG}">${esc(label)}</text>
  `;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#113a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#142a52"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">mobiusmatch</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">which of mino.mobi's ~300</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">tiny sites is <tspan fill="${ACCENT2}">actually you</tspan>?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Seven questions, no wrong</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">answers. Pulled live from</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">mino.mobi's own registry.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">mobiusmatch.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <clipPath id="clip"><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18"/></clipPath>
  <g clip-path="url(#clip)">
    ${rows}
  </g>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1.5"/>
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

// Generates public/og.png — the Open Graph preview card for patchgap.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/humanbench/og-gen.mjs, sites/griftindex/og-gen.mjs, sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Unlike those sites' cards, this one doesn't bake in a live number — every
// count on the page is refreshed on a live poll, so anything printed here
// would already be stale by the time the card gets scraped. The card
// describes what the dashboard compares instead of a point-in-time reading.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0d10", FG = "#e7edf0", DIM = "#8fa1ab";
const ACCENT = "#7ee787", ACCENT2 = "#ffb454", CLOSED = "#ff9e64", OPENCORE = "#6bc9d8";
const CARD = "#141c21", BORDER = "#263139";

const rows = [
  { label: "Windows", tag: "closed", color: CLOSED },
  { label: "macOS", tag: "closed", color: CLOSED },
  { label: "Debian", tag: "open", color: ACCENT },
  { label: "iOS", tag: "closed", color: CLOSED },
  { label: "Android", tag: "open core", color: OPENCORE },
];

const cardX = 460, cardY = 70, cardW = 680, cardH = 490;
const rowsSvg = rows
  .map((r, i) => {
    const ry = cardY + 92 + i * 78;
    return `
    <text x="${cardX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FG}">${r.label}</text>
    <rect x="${cardX + cardW - 190}" y="${ry - 22}" width="150" height="28" rx="14" fill="${BG}" stroke="${r.color}" stroke-width="1.5"/>
    <text x="${cardX + cardW - 115}" y="${ry - 2}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="1" fill="${r.color}">${r.tag.toUpperCase()}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1a2a20"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="96%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1f14"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">patchgap</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">live CVE counts by OS,</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">read straight from NVD</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="16" fill="${DIM}">closed-source desktop vs.</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="16" fill="${DIM}">a minimal open distro, and</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">iOS vs. Android — refreshed</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="16" fill="${DIM}">on a live poll, not a snapshot.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${ACCENT2}">no numbers baked in here —</text>
  <text x="64" y="464" font-family="JetBrains Mono" font-size="16" fill="${ACCENT2}">they'd be stale on arrival.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">patchgap.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">TRACKED OPERATING SYSTEMS</text>

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

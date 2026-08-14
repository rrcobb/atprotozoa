// Generates public/og.png — the Open Graph preview card for intrigue.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. (No emoji glyphs here — JetBrains Mono alone can't
// render them, so the magnifying-glass motif in the page title is skipped.)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0a12", FG = "#ece9f7", DIM = "#9a93b8";
const ACCENT = "#4fd1c5", ACCENT2 = "#c084fc";
const CARD = "#14111f", BORDER = "#2b2540";

const rows = [
  { label: "custom feed you run", pts: "+12" },
  { label: "writes alt text", pts: "+10" },
  { label: "posts in 3 languages", pts: "+8" },
];

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

const rowsSvg = rows
  .map((r, i) => {
    const ry = cardY + 250 + i * 62;
    return `
    <text x="${cardX + 48}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">${r.label}</text>
    <text x="${cardX + cardW - 48}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${ACCENT}">${r.pts}</text>
    <line x1="${cardX + 48}" y1="${ry + 20}" x2="${cardX + cardW - 48}" y2="${ry + 20}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a1250"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0d3b3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">intrigue</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">how interesting is a Bluesky</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">account, out of <tspan fill="${ACCENT2}">100</tspan>?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Custom feeds and lists, alt text,</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">language and emoji range, thread-</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">building — scored and put on a</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">calculated locally in your browser.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">intrigue.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 48}" y="${cardY + 56}" font-family="JetBrains Mono" font-weight="800" font-size="16" letter-spacing="2" fill="${DIM}">@example.bsky.social</text>

  <text x="${cardX + 48}" y="${cardY + 170}" font-family="JetBrains Mono" font-weight="800" font-size="120" fill="url(#scoreGrad)">87</text>
  <text x="${cardX + 240}" y="${cardY + 170}" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${DIM}">/ 100</text>
  <text x="${cardX + 48}" y="${cardY + 205}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">genuinely intriguing</text>

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

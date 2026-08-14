// Generates public/og.png — the Open Graph preview card for thrashmeter.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/intrigue/og-gen.mjs (this site's own lineage) and sites/didscope's.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. (No emoji glyphs here — JetBrains Mono alone can't
// render them, so the explosion motif in the page title is skipped.)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#100a0a", FG = "#f5ece7", DIM = "#b09590";
const ACCENT = "#ff5b3d", ACCENT2 = "#ffc23d";
const CARD = "#1b1210", BORDER = "#3a2620";

const rows = [
  { label: "rapid-fire bursts", pts: "+18" },
  { label: "erratic rhythm", pts: "+14" },
  { label: "all over the protocol", pts: "+9" },
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
      <stop offset="0" stop-color="#4a1408"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2a05"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">thrashmeter</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">how hard is a Bluesky account</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">thrashing, out of <tspan fill="${ACCENT2}">100</tspan>?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Rapid-fire bursts, erratic rhythm,</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">reply-diving, quote-dunks, block</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">rate — read off their entire repo,</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">computed privately in your browser.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">thrashmeter.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 48}" y="${cardY + 56}" font-family="JetBrains Mono" font-weight="800" font-size="16" letter-spacing="2" fill="${DIM}">@example.bsky.social</text>

  <text x="${cardX + 48}" y="${cardY + 170}" font-family="JetBrains Mono" font-weight="800" font-size="120" fill="url(#scoreGrad)">73</text>
  <text x="${cardX + 240}" y="${cardY + 170}" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${DIM}">/ 100</text>
  <text x="${cardX + 48}" y="${cardY + 205}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">properly thrashing</text>

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

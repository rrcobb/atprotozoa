// Generates public/og.png — the Open Graph preview card for listcheck.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and adapted from sites/beefcheck/og-gen.mjs
// (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic card, not tied to any real handles or a real check result —
// listcheck deliberately never generates a per-result share card (see
// public/lib/blocklists.js for why block-status isn't the shareable thing
// here), so this static image is the only og:image the site ever serves.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#160e0e", FG = "#f7ecec", DIM = "#bd9494";
const ACCENT = "#f4735a", ACCENT2 = "#ff9d6b", BAD = "#ff6b6b";
const CARD = "#221515", BORDER = "#3d2323", PANEL2 = "#2b1a1a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1610"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">listcheck</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">browse followers/following, check</text>
  <text x="64" y="224" font-family="JetBrains Mono" font-size="21" fill="${DIM}">blocklist status one relationship</text>
  <text x="64" y="252" font-family="JetBrains Mono" font-size="21" fill="${DIM}">at a time — never a bulk sweep.</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Public AppView + public repo records.</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="17" fill="${DIM}">One click, one pair, no auto-crawl.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${BAD}">listcheck.bisks.net</text>

  <rect x="640" y="90" width="500" height="450" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <circle cx="800" cy="220" r="46" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1.5"/>
  <circle cx="1020" cy="220" r="46" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="800" y="234" text-anchor="middle" font-family="JetBrains Mono" font-size="34" fill="${DIM}">?</text>
  <text x="1020" y="234" text-anchor="middle" font-family="JetBrains Mono" font-size="34" fill="${DIM}">?</text>
  <text x="910" y="234" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${DIM}">→</text>

  <rect x="700" y="320" width="380" height="140" rx="12" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="890" y="368" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${BAD}">✕ via list</text>
  <text x="890" y="404" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">"some blocklist"</text>
  <text x="890" y="430" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">or: clear, either direction</text>
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

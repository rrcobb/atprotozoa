// Generates public/og.png — the static Open Graph preview card for pickledash,
// so a bare link unfurls as a real thing in Bluesky / other unfurlers. Hand-
// drawn SVG matching the live page's evil-brine palette, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Per-delivery share cards are generated live, client-side, in
// public/index.html (buildShareCard) — this is just the generic fallback.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0f0a", GLOW = "#16290f", FG = "#e9ffe4", DIM = "#8fac82";
const ACCENT = "#7bff4a", EVIL = "#ff4a6a", BRINE = "#c9ff2e";
const CARD = "#101a10", BORDER = "#24361f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-10%" r="70%">
      <stop offset="0" stop-color="${GLOW}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="${W / 2}" y="180" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="88">
    <tspan fill="${ACCENT}">pickle</tspan><tspan fill="${EVIL}">dash</tspan>
  </text>

  <text x="${W / 2}" y="250" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}">one (1) evil pickle burger. delivered immediately.</text>

  <text x="${W / 2}" y="380" text-anchor="middle" font-size="140">🥒🍔</text>

  <rect x="${W / 2 - 300}" y="440" width="600" height="130" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${W / 2}" y="490" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${BRINE}">DELIVERED</text>
  <text x="${W / 2}" y="525" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">live tracker · cursed dasher · receipt at the end</text>
  <text x="${W / 2}" y="552" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${FG}">pickledash.bisks.net</text>
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

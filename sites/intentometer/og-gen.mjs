// Generates public/og.png — the static Open Graph preview card for
// intentometer, so a bare link unfurls as a real thing in Bluesky / other
// unfurlers. Hand-drawn SVG matching the live page's palette, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed —
// this box has no fontconfig/system fonts either, so the font is bundled
// in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Per-reading share cards are generated live, client-side, in
// public/app.js (buildShareCard) — this is just the generic fallback.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#100a17", GLOW = "#2a1640", FG = "#f4ecff", DIM = "#a998c4";
const ACCENT = "#ff5fa8", ACCENT2 = "#6ef2c9", CARD = "#191026", BORDER = "#362450";

const gaugeCx = W / 2, gaugeCy = 300, gaugeR = 150;

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
    <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT2}"/>
      <stop offset="0.5" stop-color="#f4e04d"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="${W / 2}" y="90" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="url(#title)">the intentometer</text>
  <text x="${W / 2}" y="132" text-anchor="middle" font-family="JetBrains Mono" font-size="21" fill="${DIM}">paste it before you send it. we'll tell you what you meant.</text>

  <path d="M ${gaugeCx - gaugeR},${gaugeCy} A ${gaugeR},${gaugeR} 0 0 1 ${gaugeCx + gaugeR},${gaugeCy}" fill="none" stroke="url(#gaugeGrad)" stroke-width="22" stroke-linecap="round"/>
  <line x1="${gaugeCx}" y1="${gaugeCy}" x2="${gaugeCx + 67}" y2="${gaugeCy - 87}" stroke="${FG}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="${gaugeCx}" cy="${gaugeCy}" r="12" fill="${FG}"/>

  <text x="${W / 2}" y="${gaugeCy + 60}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${FG}">71%</text>
  <text x="${W / 2}" y="${gaugeCy + 98}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">feral, but self-aware about it</text>

  <rect x="${W / 2 - 300}" y="${gaugeCy + 130}" width="600" height="86" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${W / 2}" y="${gaugeCy + 165}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">sample reading · yours will differ</text>
  <text x="${W / 2}" y="${gaugeCy + 195}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${FG}">genuine 6% · petty 12% · feral 41% · guarded 9% · chaotic 32%</text>

  <text x="${W / 2}" y="605" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">intentometer.bisks.net</text>
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

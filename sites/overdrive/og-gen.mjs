// Generates public/og.png — the Open Graph preview card for overdrive.
// Hand-drawn SVG rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — font is bundled in ./fonts).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (copied from
// sites/pfpyoyo/og-gen.mjs and adapted). Re-run by hand if the artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0906", FG = "#f4efe8", DIM = "#9a8f80";
const ACCENT = "#ff3b30", ACCENT2 = "#ffb020", BORDER = "#3a332a";

// A lever swung most of the way down, pivoted at the top right — same arc
// shape as the live page's #arm/#handle, frozen mid-pull.
const pivotX = 940, pivotY = 90;
const pullDeg = 62;
const armLen = 230;
const rad = (pullDeg * Math.PI) / 180;
const handleX = pivotX + Math.sin(rad) * armLen;
const handleY = pivotY + Math.cos(rad) * armLen;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a1208"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="5%" r="55%">
      <stop offset="0" stop-color="#2a1c04"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="armGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8a7a5f"/>
      <stop offset="0.5" stop-color="#4a3f2f"/>
      <stop offset="1" stop-color="#362c20"/>
    </linearGradient>
    <radialGradient id="pfpFill" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="#3a322a"/>
      <stop offset="1" stop-color="#16120c"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <rect x="0" y="${H - 22}" width="${W}" height="22" fill="${ACCENT2}" fill-opacity="0.55"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="url(#title)">overdrive</text>
  <text x="64" y="205" font-family="JetBrains Mono" font-size="22" fill="${DIM}">your pfp, gripping a massive lever —</text>
  <text x="64" y="236" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">pull it down and shove @buildthis.bisks.net</text>
  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">into overdrive: sirens, sparks, a redlined build queue.</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="17" fill="${DIM}">asked for by @fromthewestmeadow.com.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">overdrive.bisks.net</text>

  <circle cx="${pivotX}" cy="${pivotY}" r="9" fill="#7a6a54" stroke="#000" stroke-width="2"/>
  <line x1="${pivotX}" y1="${pivotY}" x2="${handleX}" y2="${handleY}" stroke="url(#armGrad)" stroke-width="16" stroke-linecap="round"/>
  <circle cx="${handleX}" cy="${handleY}" r="66" fill="url(#pfpFill)" stroke="${ACCENT}" stroke-width="5"/>
  <circle cx="${handleX - 26}" cy="${handleY - 22}" r="14" fill="#4a3d2f"/>
  <circle cx="${handleX}" cy="${handleY + 28}" r="20" fill="#4a3d2f"/>
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

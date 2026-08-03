// Generates public/og.png — the Open Graph preview card for warmward, so a
// shared link auto-renders a little compass rose in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's warm/teal look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract, adapted from
// sites/didscope/og-gen.mjs. Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#171410", FG = "#f2ede0", DIM = "#b3a890";
const ACCENT = "#ef7b4a", ACCENT2 = "#5fc4cd", CARD = "#211d16", BORDER = "#3a3325";

const cx = 860, cy = 340, r = 190;
const bearing = 52; // an illustrative "warmest" bearing, not tied to any real query

// Needle drawn pointing due north, then rotated around the compass center.
const tipY = cy - r * 0.82;
const needle = `
  <g transform="rotate(${bearing} ${cx} ${cy})">
    <polygon points="${cx},${tipY} ${cx - 16},${cy - 18} ${cx + 16},${cy - 18}" fill="${ACCENT}"/>
    <rect x="${cx - 6}" y="${cy - 18}" width="12" height="${r * 0.62}" fill="${BORDER}"/>
  </g>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2414"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="15%" r="55%">
      <stop offset="0" stop-color="#123a3d"/>
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

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">warmward</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a compass that points at</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${DIM}">whichever nearby city is</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="22" fill="${ACCENT2}">warmest right now</text>

  <text x="64" y="340" font-family="JetBrains Mono" font-size="17" fill="${DIM}">share your location (or type one) —</text>
  <text x="64" y="366" font-family="JetBrains Mono" font-size="17" fill="${DIM}">we check the nearest cities and</text>
  <text x="64" y="392" font-family="JetBrains Mono" font-size="17" fill="${DIM}">swing the needle toward the heat.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">warmward.bisks.net</text>

  <!-- compass rose -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 22}" fill="none" stroke="${BORDER}" stroke-width="1" stroke-dasharray="2,6"/>
  <text x="${cx}" y="${cy - r + 34}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">N</text>
  <text x="${cx + r - 22}" y="${cy + 8}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}">E</text>
  <text x="${cx}" y="${cy + r - 18}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}">S</text>
  <text x="${cx - r + 22}" y="${cy + 8}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}">W</text>
  ${needle}
  <circle cx="${cx}" cy="${cy}" r="9" fill="${FG}"/>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r2 = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r2.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

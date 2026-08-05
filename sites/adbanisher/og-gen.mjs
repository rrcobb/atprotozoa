// Generates public/og.png — the Open Graph preview card for adbanisher.
// A stamped certificate of banishment, matching the live app's cert card.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/foomtree/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#171008";
const GLOW = "#4a2408";
const INK = "#fbeed9";
const MUTED = "#b89a76";
const ACCENT = "#ffb100";
const STAMP = "#d8281c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="-10%" r="55%">
      <stop offset="0%" stop-color="${GLOW}"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${ACCENT}" stroke-width="3"/>

  <text x="${W / 2}" y="130" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT}">CERTIFICATE OF BANISHMENT</text>

  <text x="${W / 2}" y="230" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${INK}">@the-ad-defender</text>

  <text x="${W / 2}" y="290" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="24" fill="${MUTED}">&#8220;ads pay for the free internet, actually&#8221;</text>
  <line x1="${W / 2 - 300}" y1="303" x2="${W / 2 + 300}" y2="303" stroke="${STAMP}" stroke-width="4"/>

  <text x="${W / 2}" y="370" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${INK}">is hereby exiled to permanent residence in the</text>
  <text x="${W / 2}" y="412" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${ACCENT}">YCOMBINATOR BARNACLE FORUMS</text>
  <text x="${W / 2}" y="446" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">for crimes against the ad-free experience</text>

  <g transform="translate(${W / 2} 520) rotate(-8)">
    <rect x="-140" y="-40" width="280" height="80" rx="10" fill="none" stroke="${STAMP}" stroke-width="7"/>
    <text x="0" y="18" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${STAMP}">BANISHED</text>
  </g>

  <text x="${W / 2}" y="590" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#ff6a1a">adbanisher.bisks.net</text>
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

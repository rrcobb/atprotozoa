// Generates public/og.png — the Open Graph preview card for flagged.
// A parody of Google's red "Deceptive site ahead" interstitial, subtitled
// as a theater program. Hand-drawn SVG at the canonical OG size, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed — this
// box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/enshittify/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const PAPER = "#ffffff", INK = "#202124", MUTED = "#5f6368", RED = "#d93025", GOLD = "#e2b93b";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <!-- a thin gold curtain-swag along the top, hinting at the theater frame -->
  <rect x="0" y="0" width="${W}" height="10" fill="${GOLD}"/>

  <!-- shield icon -->
  <g transform="translate(90,86)">
    <path d="M40 0 L76 16 V50 C76 80 58 100 40 112 C22 100 4 80 4 50 V16 L40 0 Z" fill="${RED}"/>
    <rect x="35" y="30" width="10" height="42" rx="4" fill="#fff"/>
    <rect x="35" y="82" width="10" height="10" rx="4" fill="#fff"/>
  </g>

  <text x="200" y="120" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">A one-act performance piece &#183; buildthis.bisks.net</text>
  <text x="200" y="185" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${INK}">Deceptive site ahead</text>

  <text x="90" y="290" font-family="JetBrains Mono" font-size="24" fill="${INK}">a tragedy in three clicks</text>
  <text x="90" y="330" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">performed live by a small website, complaining, at great</text>
  <text x="90" y="360" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">length and in verse, about being flagged</text>

  <!-- fake buttons, echoing the real interstitial -->
  <rect x="90" y="410" width="190" height="52" rx="6" fill="#1a73e8"/>
  <text x="185" y="443" text-anchor="middle" font-family="JetBrains Mono" font-weight="500" font-size="18" fill="#fff">Back to safety</text>
  <text x="310" y="443" font-family="JetBrains Mono" font-size="18" fill="#1a73e8">Details</text>

  <text x="90" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${RED}">bisks.net/flagged</text>
  <text x="${W - 60}" y="${H - 40}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${MUTED}" opacity="0.8">not recommended, but it's just a website</text>
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

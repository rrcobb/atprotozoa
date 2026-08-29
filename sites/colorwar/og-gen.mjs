// Generates public/og.png — the Open Graph preview card for colorwar.
// A "tribunal verdict" mock: masthead, a sample faction verdict, and the
// unhinged rating. Drawn shapes + mono text, not emoji (the bundled font
// has no color-emoji glyphs and resvg would render tofu — same reasoning
// as sites/shipname/og-gen.mjs). Rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG1 = "#0c0e14", BG2 = "#07080c";
const INK = "#f2f4fa", DIM = "#9aa3b8";
const RED = "#ff4d5e", YELLOW = "#ffd23f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${RED}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${RED}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="50%">
      <stop offset="0" stop-color="${YELLOW}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="90" font-family="JetBrains Mono" font-weight="800" font-size="18" letter-spacing="4" fill="${YELLOW}">COLORWAR</text>
  <text x="64" y="152" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">pick a side, answer for it</text>
  <line x1="64" y1="180" x2="720" y2="180" stroke="${RED}" stroke-width="3"/>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Eight extremely petty rapid-fire</text>
  <text x="64" y="268" font-family="JetBrains Mono" font-size="20" fill="${DIM}">questions sort you into a color faction</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="20" fill="${DIM}">and hand down an unhinged rating.</text>

  <text x="64" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${YELLOW}">colorwar.bisks.net</text>

  <rect x="640" y="86" width="500" height="460" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(242,244,250,0.18)" stroke-width="1.5"/>
  <text x="890" y="146" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${YELLOW}">THE TRIBUNAL HAS RULED</text>
  <line x1="800" y1="164" x2="980" y2="164" stroke="${RED}" stroke-width="2"/>

  <text x="890" y="238" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${RED}">TEAM RED</text>
  <text x="890" y="278" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-weight="700" font-size="22" fill="${DIM}">the arsonist</text>

  <text x="890" y="410" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${RED}">87</text>
  <text x="890" y="446" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">UNHINGED RATING &#183; WARLORD</text>
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

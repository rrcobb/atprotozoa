// Generates public/og.png — the Open Graph preview card for aphoverb.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/stanquiz/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0d0c", INK = "#eef2ef", MUTED = "#93a39a";
const SAGE = "#7fd8a3", AMBER = "#ffb454";
const CARD = "#131715", BORDER = "rgba(238,242,239,0.14)";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgL" cx="15%" cy="10%" r="60%">
      <stop offset="0" stop-color="#123322" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgR" cx="90%" cy="90%" r="60%">
      <stop offset="0" stop-color="#3a2a10" stop-opacity="0.8"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgL)"/>
  <rect width="${W}" height="${H}" fill="url(#bgR)"/>

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${SAGE}">apho<tspan fill="${AMBER}">verb</tspan></text>
  <text x="60" y="188" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">proverb, or aphorism?</text>

  <text x="60" y="270" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">A mashup built from Wikipedia's List of</text>
  <text x="60" y="296" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">proverbial phrases, plus the real aphorisms</text>
  <text x="60" y="322" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">it doesn't have its own list for.</text>

  <text x="60" y="380" font-family="JetBrains Mono" font-size="15" fill="${SAGE}">"time is money" — proverb, or Franklin?</text>
  <text x="60" y="408" font-family="JetBrains Mono" font-size="15" fill="${AMBER}">"knowledge is power" — folklore, or Bacon?</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AMBER}">bisks.net/aphoverb</text>

  <rect x="660" y="80" width="480" height="470" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="900" y="200" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${AMBER}">9/12</text>
  <text x="900" y="248" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${INK}">philologist</text>
  <text x="900" y="278" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">reading form, not just content</text>

  <line x1="712" y1="316" x2="1088" y2="316" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>

  <text x="900" y="356" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${SAGE}">proverb</text>
  <text x="900" y="382" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">anonymous · worn smooth by repetition</text>
  <text x="900" y="428" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${AMBER}">aphorism</text>
  <text x="900" y="454" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">authored · first appears in a book</text>

  <text x="900" y="510" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">+ the discrepancies where a "proverb"</text>
  <text x="900" y="530" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">turns out to have a byline all along</text>
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

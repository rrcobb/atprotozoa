// Generates public/og.png — the Open Graph preview card for glazerank, so a
// shared link auto-renders a picture of the score meter in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed —
// the font is bundled in ./fonts and loaded explicitly). Adapted from
// sites/chickenjack/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const BG = "#fffaf2", INK = "#241c12", MUTED = "#8a7a63";
const ACCENT = "#d98e2b", ACCENT2 = "#e8562f";

const SCORE = 847; // sample reading for the static card art, not a real account

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="90%" cy="0%" r="60%">
      <stop offset="0" stop-color="#fde3d4"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="5%" cy="100%" r="60%">
      <stop offset="0" stop-color="#fdeecb"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="108" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">glazerank</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="500" font-size="26" fill="${MUTED}">the atproto glazer score, 0–1000</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-weight="800" font-size="200" fill="${INK}">${SCORE}</text>
  <text x="574" y="330" font-family="JetBrains Mono" font-weight="500" font-size="46" fill="${MUTED}">/ 1000</text>
  <text x="66" y="378" font-family="JetBrains Mono" font-weight="700" font-size="38" fill="${ACCENT2}">posts about nothing else</text>

  <rect x="64" y="420" width="1072" height="26" rx="13" fill="#ecdfc7"/>
  <rect x="64" y="420" width="${1072 * (SCORE / 1000)}" height="26" rx="13" fill="url(#bar)"/>

  <text x="64" y="500" font-family="JetBrains Mono" font-weight="500" font-size="30" fill="${MUTED}">&#8220;my pds, my rules &#8212; atproto atproto atproto&#8221;</text>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="600" font-size="26" fill="${MUTED}">enter a handle · read their whole post history · rank them on the board</text>
</svg>`;

const fontPath = path.join(__dirname, "fonts", "JetBrainsMono.ttf");
const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(path.join(__dirname, "public", "og.png"), png);
console.log("wrote public/og.png");

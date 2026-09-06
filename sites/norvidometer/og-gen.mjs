// Generates public/og.png — the Open Graph preview card for norvidometer.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Adapted from sites/hypeorhickey/og-gen.mjs (copy, don't abstract).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0b10", INK = "#eaf2fb", MUTED = "#8b96ab";
const COOL = "#63c7ff", HOT = "#c48aff";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COOL}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${HOT}" stop-opacity="0.16"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="rgba(234,242,251,0.18)" stroke-width="1.5"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${COOL}">claim <tspan fill="${INK}">or </tspan><tspan fill="${HOT}">heuristic</tspan></text>
  <text x="60" y="165" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">how norvid are you?</text>

  <text x="60" y="250" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">a short post is on screen. is it a claim, or a</text>
  <text x="60" y="278" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">heuristic? straight from a real thread where</text>
  <text x="60" y="306" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">norvid himself wasn't sure there's a difference.</text>
  <text x="60" y="334" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">some of the posts don't have an answer either.</text>

  <text x="60" y="440" font-family="JetBrains Mono" font-weight="800" font-size="90" fill="${COOL}">?<tspan fill="${INK}"> / </tspan><tspan fill="${HOT}">18</tspan></text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">norvidometer.bisks.net</text>
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

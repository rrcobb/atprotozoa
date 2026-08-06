// Generates public/og.png — the Open Graph preview card for hypeorhickey.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Adapted from sites/stanquiz/og-gen.mjs (copy, don't abstract).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0b10", INK = "#eaf2fb", MUTED = "#8b96ab";
const COOL = "#63c7ff", HOT = "#ff8a4c";

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

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${COOL}">hype<tspan fill="${INK}"> or </tspan><tspan fill="${HOT}">hickey</tspan></text>
  <text x="60" y="185" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">guess who said the euphoric quote</text>

  <text x="60" y="270" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Bluesky staff, or Rob Pike, Rich Hickey, Larry</text>
  <text x="60" y="298" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Wall, Zed Shaw, Andrew Kelley — vs. Jensen</text>
  <text x="60" y="326" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Huang, Elon Musk, Sam Altman, Adam Neumann,</text>
  <text x="60" y="354" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">and Masayoshi Son. every quote is real.</text>

  <text x="60" y="440" font-family="JetBrains Mono" font-weight="800" font-size="90" fill="${COOL}">?<tspan fill="${INK}"> / </tspan><tspan fill="${HOT}">49</tspan></text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">hypeorhickey.bisks.net</text>
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

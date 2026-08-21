// Generates public/og.png — the Open Graph preview card for noai.
//
// Hand-drawn SVG at the canonical OG size: a big struck-through A and I over
// the wordmark. Rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/chimehose/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05060a", PANEL = "#0c0f18", INK = "#eaf2fb", MUTED = "#90a2b8";
const OK = "#7cffb2", BAD = "#ff6b6b", ACCENT = "#ffd166";
const BORDER = "rgba(234,242,251,0.14)";

function strikeLetter(cx, cy, letter) {
  return `
    <text x="${cx}" y="${cy}" font-family="JetBrains Mono" font-weight="800" font-size="200" fill="${BAD}" text-anchor="middle">${letter}</text>
    <line x1="${cx - 95}" y1="${cy - 62}" x2="${cx + 95}" y2="${cy - 82}" stroke="${BAD}" stroke-width="10" stroke-linecap="round" transform="rotate(-8 ${cx} ${cy - 70})"/>
  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgL" cx="20%" cy="25%" r="55%">
      <stop offset="0" stop-color="#331414"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgR" cx="82%" cy="70%" r="55%">
      <stop offset="0" stop-color="#0e2a20"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgL)"/>
  <rect width="${W}" height="${H}" fill="url(#bgR)"/>

  ${strikeLetter(280, 300, "A")}
  ${strikeLetter(480, 300, "I")}

  <text x="60" y="440" font-family="JetBrains Mono" font-weight="800" font-size="90" fill="${INK}">no<tspan fill="${OK}">ai</tspan></text>
  <text x="60" y="490" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">a bluesky feed with no A and no I</text>

  <rect x="60" y="530" width="1080" height="60" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="90" y="568" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">filtered live off the firehose · zero storage</text>

  <text x="820" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/noai</text>
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

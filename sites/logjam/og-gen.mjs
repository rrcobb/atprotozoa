// Generates public/og.png — the Open Graph preview card for logjam, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: a rail line and a road, each with
// a cargo glyph rolling toward a "HUB" marker, over the wordmark. Rasterised
// with @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
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
const AMBER = "#ffb454", TEAL = "#5fd8c9", PINK = "#ff7ab8";
const BORDER = "rgba(234,242,251,0.14)";

function dashedTrack(y, color) {
  return `<line x1="70" y1="${y}" x2="1000" y2="${y}" stroke="${color}" stroke-width="4" stroke-dasharray="14 10" opacity="0.55"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgL" cx="18%" cy="24%" r="55%">
      <stop offset="0" stop-color="#3a2a10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgR" cx="85%" cy="78%" r="55%">
      <stop offset="0" stop-color="#0e2a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgL)"/>
  <rect width="${W}" height="${H}" fill="url(#bgR)"/>

  <text x="60" y="130" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${AMBER}">log<tspan fill="${TEAL}">jam</tspan></text>
  <text x="60" y="178" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">the atproto firehose as a freight network</text>

  ${dashedTrack(300, AMBER)}
  <circle cx="1030" cy="300" r="20" fill="none" stroke="${AMBER}" stroke-width="4"/>
  <text x="1020" y="307" font-family="JetBrains Mono" font-size="18" fill="${AMBER}">H</text>
  <rect x="230" y="278" width="72" height="44" rx="8" fill="${AMBER}"/>
  <text x="252" y="308" font-family="JetBrains Mono" font-size="24" fill="${BG}">P</text>

  ${dashedTrack(390, TEAL)}
  <circle cx="1030" cy="390" r="20" fill="none" stroke="${TEAL}" stroke-width="4"/>
  <text x="1020" y="397" font-family="JetBrains Mono" font-size="18" fill="${TEAL}">H</text>
  <rect x="560" y="368" width="72" height="44" rx="8" fill="${TEAL}"/>
  <text x="586" y="398" font-family="JetBrains Mono" font-size="24" fill="${BG}">L</text>

  <text x="70" y="270" font-family="JetBrains Mono" font-size="16" fill="${MUTED}" letter-spacing="2">DEPOT</text>
  <text x="946" y="270" font-family="JetBrains Mono" font-size="16" fill="${MUTED}" letter-spacing="2">HUB</text>

  <rect x="60" y="470" width="1080" height="110" rx="14" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="90" y="512" font-family="JetBrains Mono" font-size="19" fill="${AMBER}">every commit = a shipment</text>
  <text x="90" y="546" font-family="JetBrains Mono" font-size="19" fill="${TEAL}">post · like · repost · follow · block, each its own lane</text>
  <text x="700" y="512" font-family="JetBrains Mono" font-size="19" fill="${INK}">deletes come back as recalls</text>
  <text x="700" y="546" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">live off the real jetstream</text>

  <text x="60" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${PINK}">bisks.net/logjam</text>
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

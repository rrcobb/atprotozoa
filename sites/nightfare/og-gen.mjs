// Generates public/og.png — the Open Graph preview card for nightfare.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png (needs node_modules/@resvg/* present)
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#06070a", BG2 = "#2a0a10", FG = "#f2ece6", DIM = "#9aa2b3";
const ACCENT = "#ff4d5e", ACCENT2 = "#5fb0ff", CARD = "#120a0c", BORDER = "#3a1418";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const quote = "“Atlantis wasn't a story. It was a warning label.”";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="65%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="60%">
      <stop offset="0" stop-color="#1a0a12"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="#ff8a6a"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">nightfare</text>
  <text x="66" y="188" font-family="JetBrains Mono" font-size="20" letter-spacing="3" fill="${ACCENT2}">GATWICK &#8594; HEATHROW</text>

  <text x="64" y="252" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Get in the taxi. The driver starts with traffic</text>
  <text x="64" y="280" font-family="JetBrains Mono" font-size="19" fill="${DIM}">and roadworks. He does not end there.</text>

  <rect x="64" y="330" width="720" height="210" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="96" y="384" font-family="JetBrains Mono" font-size="13" letter-spacing="2" fill="${ACCENT}">THE DRIVER, UNPROMPTED</text>
  <text x="96" y="430" font-family="JetBrains Mono" font-size="23" fill="${FG}">${esc(quote)}</text>
  <text x="96" y="466" font-family="JetBrains Mono" font-size="16" fill="${DIM}">(this is roughly the halfway point)</text>

  <text x="64" y="590" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">bisks.net/nightfare</text>

  <!-- a small back-seat mirror glint, upper right -->
  <g transform="translate(990,90)" opacity="0.9">
    <rect x="-90" y="-46" width="180" height="92" rx="46" fill="none" stroke="${BORDER}" stroke-width="3"/>
    <circle cx="0" cy="0" r="5" fill="${ACCENT}"/>
  </g>
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

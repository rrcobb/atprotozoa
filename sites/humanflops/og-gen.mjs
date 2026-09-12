// Generates public/og.png — the Open Graph preview card for humanflops.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Copied and adapted from
// sites/blocksweep/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic card, not tied to any real run — like blocksweep, an actual
// result (this run's answers/min) isn't cacheable as a static image without
// a per-result server route, so this static card is the only og:image the
// site serves; the per-run share card is drawn client-side onto <canvas>.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0e0a", FG = "#e3f0e3", DIM = "#8fae8f";
const ACCENT = "#8fff6b", ACCENT2 = "#c084fc";
const CARD = "#121a12", BORDER = "#1e2b1e";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#182c1a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">humanflops</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">single-digit multiplication, timed.</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">30-second levels, answers/min + accuracy.</text>

  <text x="64" y="310" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">then, kindly, a comparison to —</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="18" fill="${ACCENT}">a 1990 TI-81 graphing calculator</text>
  <text x="64" y="384" font-family="JetBrains Mono" font-size="18" fill="${ACCENT2}">an NVIDIA RTX 3090</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">humanflops.bisks.net</text>

  <rect x="700" y="130" width="440" height="360" rx="20" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="920" y="290" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="90" fill="${FG}">6×7</text>
  <text x="920" y="340" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${DIM}">no calculator</text>
  <text x="920" y="440" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">be nice — it's not a fair fight</text>
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

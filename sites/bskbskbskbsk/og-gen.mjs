// Generates public/og.png — the Open Graph preview card for bskbskbskbsk,
// so a shared link unfurls with the pitch instead of a bare URL.
//
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — font bundled in ./fonts). Adapted from sites/purrbox/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;
const BG = "#0d1210";
const INK = "#eef6f1";
const MUTED = "#8fa89c";
const FAINT = "#26332e";
const DOT = "#ff4d4d";
const ACCENT = "#ffce54";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="20%" cy="15%" r="60%">
      <stop offset="0" stop-color="#241010"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="76" y="150" font-family="JetBrains Mono" font-weight="700" font-size="22" letter-spacing="6" fill="${DOT}">CLICKS · CHIRP · SQUEAK · DOT</text>
  <text x="76" y="240" font-family="JetBrains Mono" font-weight="800" font-size="68" letter-spacing="0" fill="${INK}">bskbskbskbsk</text>
  <text x="76" y="292" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a bot that attracts cats</text>

  <text x="76" y="420" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">synthesized tongue-clicks, a bird chirp</text>
  <text x="76" y="452" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">and a mouse squeak, live from Web Audio —</text>
  <text x="76" y="484" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">plus a wandering laser-style dot.</text>
  <text x="76" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DOT}">bskbskbskbsk.bisks.net</text>

  <g>
    <rect x="860" y="140" width="260" height="180" rx="14" fill="#151d1a" stroke="${FAINT}" stroke-width="2"/>
    <circle cx="990" cy="230" r="16" fill="${DOT}" opacity="0.95"/>
    <circle cx="990" cy="230" r="30" fill="${DOT}" opacity="0.18"/>
    <path d="M 900 300 Q 940 200 990 230 Q 1040 260 1080 170" stroke="${ACCENT}" stroke-width="3" fill="none" stroke-dasharray="6 8" opacity="0.7"/>
  </g>

  <rect x="76" y="330" width="230" height="6" rx="3" fill="${FAINT}"/>
  <rect x="76" y="330" width="180" height="6" rx="3" fill="${DOT}"/>
  <rect x="76" y="358" width="230" height="6" rx="3" fill="${FAINT}"/>
  <rect x="76" y="358" width="140" height="6" rx="3" fill="${ACCENT}"/>
  <rect x="76" y="386" width="230" height="6" rx="3" fill="${FAINT}"/>
  <rect x="76" y="386" width="200" height="6" rx="3" fill="${MUTED}"/>
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

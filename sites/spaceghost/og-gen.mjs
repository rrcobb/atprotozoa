// Generates public/og.png — the static Open Graph preview card for
// spaceghost. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (no system Chromium / fontconfig on this box, so the font
// is bundled in ./fonts and loaded explicitly). Mirrors sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#05010c", FG = "#f4eaff", DIM = "#8f7fae";
const ACCENT = "#ff2f92", ACCENT2 = "#26f2c9", ACCENT3 = "#ffd23f";
const CARD = "#140a24", BORDER = "#3a2456";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#2a1140"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="88%" cy="15%" r="55%">
      <stop offset="0" stop-color="#0a2b3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="0.6" stop-color="${ACCENT2}"/>
      <stop offset="1" stop-color="${ACCENT3}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="${BORDER}" stroke-width="3"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">SPACE GHOST</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">COAST TO COAST</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="20" letter-spacing="3" fill="${ACCENT3}">— A GUEST INTERVIEW SIMULATOR —</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="21" fill="${DIM}">You're tonight's guest. Space Ghost will</text>
  <text x="64" y="358" font-family="JetBrains Mono" font-size="21" fill="${DIM}">interview you, badly. Zorak will heckle.</text>
  <text x="64" y="386" font-family="JetBrains Mono" font-size="21" fill="${DIM}">Moltar may catch something on fire.</text>

  <rect x="64" y="440" width="500" height="112" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="90" y="480" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT2}">TONIGHT'S RATING</text>
  <text x="90" y="518" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${FG}">7.5 out of 10 ghosts</text>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">spaceghost.bisks.net</text>

  <g transform="translate(870,120)">
    <ellipse cx="130" cy="220" rx="118" ry="150" fill="#1c0f2c" stroke="${ACCENT}" stroke-width="3"/>
    <circle cx="90" cy="190" r="16" fill="${FG}"/>
    <circle cx="170" cy="190" r="16" fill="${FG}"/>
    <circle cx="90" cy="190" r="6" fill="#05010c"/>
    <circle cx="170" cy="190" r="6" fill="#05010c"/>
    <path d="M70 250 Q130 290 190 250" stroke="${FG}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <rect x="40" y="330" width="180" height="26" rx="13" fill="${ACCENT3}"/>
    <rect x="20" y="370" width="220" height="22" rx="11" fill="${ACCENT2}"/>
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

// Generates public/og.png — the static Open Graph preview card for the bare
// bottomcoded link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/topchicken/og-gen.mjs and
// sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#120a16", INK = "#f5edf7", MUTED = "#ab97b8";
const BOTTOM = "#5aa2ff", MID = "#b25aff", TOP = "#ff4d84";
const CARD = "#1b1120", BORDER = "#33223d";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="-5%" r="65%">
      <stop offset="0" stop-color="#331a45"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BOTTOM}"/>
      <stop offset="0.5" stop-color="${MID}"/>
      <stop offset="1" stop-color="${TOP}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="60" y="118" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${TOP}">bottomcoded</text>
  <text x="64" y="160" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">bottom or top posting energy? enter a handle and find out.</text>

  <rect x="64" y="196" width="1072" height="1" fill="${BORDER}"/>

  <rect x="64" y="240" width="1072" height="240" rx="18" fill="${CARD}" stroke="${BORDER}"/>
  <text x="600" y="300" text-anchor="middle" font-family="JetBrains Mono" font-weight="900" font-size="34" fill="${INK}">"yes."</text>
  <text x="600" y="332" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">scored across your last 100 posts</text>

  <text x="140" y="392" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${BOTTOM}">BOTTOM</text>
  <text x="1060" y="392" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${TOP}">TOP</text>
  <rect x="140" y="404" width="920" height="14" rx="7" fill="url(#bar)"/>
  <circle cx="700" cy="411" r="13" fill="#140a1a" stroke="${INK}" stroke-width="4"/>
  <text x="600" y="450" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">hedging + apologies ←──────────→ declarative + no notes</text>

  <text x="64" y="588" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">bottomcoded.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

// Generates public/og.png — the Open Graph preview card for burnbook.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0908", PARCH = "#ece1c8", PARCH_DIM = "#cbbd9c";
const DIM = "#a3927b", EMBER = "#d4622c", EMBER2 = "#f0a441", ASH = "#5a5048";
const CARD = "#171310", BORDER = "#3a2f24", DANGER = "#b23a2f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a1608"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="88%" cy="90%" r="55%">
      <stop offset="0" stop-color="#331408"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${EMBER2}"/>
      <stop offset="1" stop-color="${EMBER}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">burnbook</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a book, forged just for you.</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="22" fill="${DIM}">read once. then it burns.</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="17" fill="${DIM}">One copy, generated fresh, ever.</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="17" fill="${DIM}">No archive. No second printing.</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="17" fill="${DIM}">When it burns, it's the only</text>
  <text x="64" y="378" font-family="JetBrains Mono" font-size="17" fill="${DIM}">reader who will ever have it.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${EMBER}">burnbook.bisks.net</text>

  <g transform="translate(760,150)">
    <rect x="-6" y="0" width="10" height="330" rx="4" fill="#4a2f1c"/>
    <rect x="4" y="0" width="330" height="330" rx="8" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
    <rect x="248" y="26" width="70" height="34" rx="4" fill="none" stroke="${DANGER}" stroke-width="2" transform="rotate(6 283 43)"/>
    <text x="283" y="40" font-family="JetBrains Mono" font-weight="800" font-size="9" fill="${DANGER}" text-anchor="middle" transform="rotate(6 283 43)">UNIQUE</text>
    <text x="283" y="50" font-family="JetBrains Mono" font-weight="800" font-size="9" fill="${DANGER}" text-anchor="middle" transform="rotate(6 283 43)">EDITION</text>
    <text x="34" y="70" font-family="JetBrains Mono" font-weight="700" font-size="11" letter-spacing="2" fill="${EMBER2}">FIELD NOTES</text>
    <text x="34" y="108" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${PARCH}">The Ashen Ledger</text>
    <text x="34" y="138" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${PARCH}">of Wrenmoor</text>
    <text x="34" y="172" font-family="JetBrains Mono" font-size="14" fill="${DIM}">by Marguerite Vane</text>
    <line x1="34" y1="196" x2="298" y2="196" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="34" y="222" font-family="JetBrains Mono" font-size="12" fill="${DIM}">217 pages · 1 of 1 copies</text>
    <text x="34" y="244" font-family="JetBrains Mono" font-size="12" fill="${ASH}">catalog no. BB-20260817-9F3C</text>
    <rect x="34" y="270" width="264" height="36" rx="6" fill="${DANGER}" opacity="0.9"/>
    <text x="166" y="293" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="#1a0603" text-anchor="middle">BEGIN THE CEREMONY</text>
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

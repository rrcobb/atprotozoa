// Generates public/og.png — the static Open Graph preview card. Hand-drawn
// SVG, rasterised with @resvg/resvg-js and skyclone's bundled JetBrains Mono
// font (no system Chromium/fontconfig needed). Same recipe as
// sites/moistchicken/og-gen.mjs (copy, don't abstract).
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#071a10";
const INK = "#eafcef";
const MUTED = "#7ea88c";
const GREEN = "#4ade80";
const CARD = "#0f2b1b";
const BORDER = "#1e4a2c";
const GOLD = "#f4d35e";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="-5%" r="60%">
      <stop offset="0" stop-color="#123a22"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${GREEN}">$ mail-a-dollar</text>
  <text x="64" y="170" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">find the author, send the buck</text>

  <rect x="64" y="206" width="1072" height="1" fill="${BORDER}"/>

  <rect x="64" y="240" width="1072" height="230" rx="14" fill="${CARD}" stroke="${BORDER}"/>
  <circle cx="150" cy="355" r="56" fill="none" stroke="${GOLD}" stroke-width="4"/>
  <text x="150" y="376" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${GOLD}">$</text>
  <text x="240" y="330" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">PAY TO THE ORDER OF</text>
  <text x="240" y="368" font-family="JetBrains Mono" font-weight="700" font-size="34" fill="${INK}">the author, probably</text>
  <text x="240" y="410" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">from: a reader who liked the book</text>

  <text x="64" y="522" font-family="JetBrains Mono" font-size="21" fill="${INK}">type a name → we check Bluesky for a tip link in their bio →</text>
  <text x="64" y="552" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${GREEN}">no luck? we print you a dollar to mail them instead.</text>

  <text x="64" y="596" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">bisks.net/mailadollar</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

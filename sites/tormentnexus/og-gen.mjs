// Generates public/og.png — the Open Graph preview card for tormentnexus.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// via sites/sysvangelist, which vendors this from sites/dontpressit. House
// style: self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0908", INK = "#f2e9de", MUTED = "#998a78";
const RED = "#c8371e", AMBER = "#d8a13a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="18" fill="${AMBER}"/>
  <rect x="0" y="${H - 18}" width="${W}" height="18" fill="${AMBER}"/>

  <text x="90" y="130" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${RED}" letter-spacing="3">⚠ PARTIALLY-ASSEMBLED</text>
  <text x="90" y="220" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${INK}">TORMENT</text>
  <text x="90" y="300" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${RED}">NEXUS</text>

  <text x="90" y="360" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">stuck at 73% forever. every switch and dial</text>
  <text x="90" y="392" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">is a decoy. only one control is real:</text>
  <text x="90" y="424" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#4fd67a">LOCK THE DOOR.</text>

  <rect x="88" y="470" width="420" height="1" fill="#2c241c"/>
  <text x="90" y="520" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${RED}">tormentnexus.bisks.net</text>
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

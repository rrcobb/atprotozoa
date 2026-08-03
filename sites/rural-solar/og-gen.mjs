// Generates public/og.png — the static Open Graph preview card for
// rural-solar.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/wentviral/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const CREAM = "#f7f2e3", NAVY = "#0a2647", RED = "#a3172a", GOLD = "#b8860b", INK = "#171410";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function stamp(y, claim) {
  return `
  <g>
    <rect x="64" y="${y}" width="${W - 128}" height="76" fill="#fffdf7" stroke="${INK}" stroke-width="2"/>
    <text x="88" y="${y + 32}" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${RED}">DEBUNKED —</text>
    <text x="230" y="${y + 32}" font-family="JetBrains Mono" font-size="18" fill="${INK}">${esc(claim)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect width="${W}" height="128" fill="${NAVY}"/>
  <rect y="128" width="${W}" height="10" fill="${RED}"/>

  <text x="600" y="58" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${GOLD}" letter-spacing="4">FOR GOD, FOR FAMILY, FOR THE FAMILY FARM</text>
  <text x="600" y="105" text-anchor="middle" font-family="JetBrains Mono" font-weight="900" font-size="44" fill="#fffdf7" letter-spacing="1">THE HEARTLAND SENTINEL</text>

  <text x="64" y="200" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">They said solar would kill your herd.</text>
  <text x="64" y="238" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">We checked. Here's the truth.</text>

  ${stamp(280, "\"panels will kill livestock\"")}
  ${stamp(368, "\"panels ruin crops and soil\"")}
  ${stamp(456, "\"panels leach metals + PFAS\"")}

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RED}">rural-solar.bisks.net</text>
  <text x="64" y="608" font-family="JetBrains Mono" font-size="15" fill="${INK}">exclusive report: the actual agrivoltaics research</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

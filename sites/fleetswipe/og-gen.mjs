// Generates public/og.png — the static Open Graph preview card for the bare
// fleetswipe.bisks.net link. Hand-drawn SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts and loaded
// explicitly). Same recipe as sites/orrery/og-gen.mjs and
// sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0f1115";
const CARD = "#171a21";
const BORDER = "#2a2e38";
const FG = "#eef0f4";
const DIM = "#9198a8";
const KEEP = "#52d68a";
const SKIP = "#ff5f7e";

function card(x, y, rot, stampColor, stampText, title, blurb) {
  return `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="0" y="0" width="360" height="440" rx="20" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
    <rect x="24" y="28" width="140" height="30" rx="15" fill="${KEEP}"/>
    <text x="94" y="48" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="${BG}" text-anchor="middle">toy</text>
    <text x="24" y="110" font-family="JetBrains Mono" font-size="26" font-weight="700" fill="${FG}">${title}</text>
    <text x="24" y="150" font-family="JetBrains Mono" font-size="15" fill="${DIM}">${blurb}</text>
    <text x="${stampColor === KEEP ? 210 : 24}" y="400" font-family="JetBrains Mono" font-size="34" font-weight="800" fill="${stampColor}" opacity="0.85" transform="rotate(${stampColor === KEEP ? -10 : 10} 100 400)">${stampText}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${card(60, 95, -6, SKIP, "SKIP", "some site", "one of 588", 1)}
  ${card(420, 130, 4, KEEP, "KEEP", "another one", "swipe right", 1)}

  <text x="800" y="230" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${FG}">fleetswipe</text>
  <text x="802" y="286" font-family="JetBrains Mono" font-size="22" fill="${DIM}">swipe the whole bisks.net fleet —</text>
  <text x="802" y="318" font-family="JetBrains Mono" font-size="22" fill="${DIM}">right to keep, left to skip</text>

  <text x="802" y="380" font-family="JetBrains Mono" font-size="17" fill="${DIM}">588 tiny sites &#183; one deck &#183; your fleet, your call</text>

  <text x="802" y="540" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${KEEP}">fleetswipe.bisks.net</text>
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

// Generates public/og.png — the static Open Graph preview card for prosodle.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Shows a representative roll,
// not a live one — the real page always computes its own score client-side.
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

const BG = "#0d120c", BG2 = "#1c2a16", FG = "#eef3e6", MUTED = "#9db08f";
const ACCENT = "#8bc34a", ACCENT2 = "#e0c341", TILE = "#1d2a19", FAINT = "#33452c";

const VOWELS = new Set(["I", "E", "A"]);
const letters = "CRAFTMINE".split("");
const score = 85, grade = "A";
const flavor = "flows nicer than the actual word.";
const cadence = 81, mouthfeel = 79, punch = 64;

const tileW = 92, gap = 14;
const totalW = letters.length * tileW + (letters.length - 1) * gap;
let x = (W - totalW) / 2;
const tileY = 150;

const tilesSvg = letters
  .map((l) => {
    const isVowel = VOWELS.has(l);
    const rectX = x;
    x += tileW + gap;
    return `
    <rect x="${rectX}" y="${tileY}" width="${tileW}" height="${tileW}" rx="14" fill="${TILE}" stroke="${isVowel ? ACCENT2 : FAINT}" stroke-width="3"/>
    <text x="${rectX + tileW / 2}" y="${tileY + tileW / 2 + 17}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="${isVowel ? ACCENT2 : FG}">${l}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="-8%" r="75%">
      <stop offset="0%" stop-color="${BG2}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <text x="${W / 2}" y="90" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${MUTED}">PROSODLE</text>

  ${tilesSvg}

  <text x="${W / 2 - 60}" y="380" text-anchor="middle" font-family="JetBrains Mono" font-weight="900" font-size="96" fill="${FG}">${score}</text>
  <text x="${W / 2 + 90}" y="380" text-anchor="middle" font-family="JetBrains Mono" font-weight="900" font-size="46" fill="${ACCENT}">${grade}</text>

  <text x="${W / 2}" y="440" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="26" fill="${FG}">${flavor}</text>

  <text x="${W / 2}" y="500" text-anchor="middle" font-family="JetBrains Mono" font-weight="600" font-size="22" fill="${MUTED}">cadence ${cadence} &#183; mouthfeel ${mouthfeel} &#183; punch ${punch}</text>

  <text x="${W / 2}" y="580" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">prosodle.bisks.net</text>
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

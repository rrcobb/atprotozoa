// Generates public/og.png — the Open Graph preview card for mootoftheyear,
// so a shared link auto-renders a picture of the cover concept in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, matching the
// live page's TIME-parody look, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so fonts are bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is a generic sample cover (not tied to any real handle) — the static
// fallback card for the bare link. Per-person covers are generated live,
// client-side, in public/index.html (drawCoverCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PAPER = "#f7f3ea", INK = "#17130f", RED = "#d21f1f", DIM = "#6b6255", GOLD = "#c9a227";
const SERIF = "DejaVu Serif", MONO = "JetBrains Mono";

// mini cover mockup, right side
const cx = 800, cy = 44, cw = 340, ch = 542;
const mastY = cy + 22, mastH = 62;
const photoY = mastY + mastH + 40, photoH = 300;
const headlineY = photoY + photoH + 44;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="${SERIF}" font-weight="bold" font-size="70" fill="${RED}">MOOT</text>
  <text x="64" y="196" font-family="${SERIF}" font-size="34" fill="${INK}">of the Year</text>

  <text x="64" y="270" font-family="${MONO}" font-size="19" fill="${DIM}">Enter a Bluesky handle. We pull your</text>
  <text x="64" y="298" font-family="${MONO}" font-size="19" fill="${DIM}">best-performing post as the headline,</text>
  <text x="64" y="326" font-family="${MONO}" font-size="19" fill="${DIM}">your avatar as the cover photo, and</text>
  <text x="64" y="354" font-family="${MONO}" font-size="19" fill="${DIM}">print a real magazine cover.</text>

  <text x="64" y="560" font-family="${MONO}" font-weight="bold" font-size="21" fill="${RED}">mootoftheyear.bisks.net</text>

  <!-- right: sample cover mockup -->
  <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="#ffffff" stroke="${INK}" stroke-width="1"/>
  <rect x="${cx + 5}" y="${cy + 5}" width="${cw - 10}" height="${ch - 10}" fill="none" stroke="${RED}" stroke-width="10"/>

  <rect x="${cx + 24}" y="${mastY}" width="${cw - 48}" height="${mastH}" fill="${RED}"/>
  <text x="${cx + cw / 2}" y="${mastY + mastH - 16}" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="44" fill="#fff8ec">MOOT</text>

  <rect x="${cx + 24}" y="${photoY}" width="${cw - 48}" height="${photoH}" fill="#e8ddc4" stroke="${INK}" stroke-width="2"/>
  <circle cx="${cx + cw / 2}" cy="${photoY + photoH / 2 - 20}" r="58" fill="#cabf9e"/>
  <rect x="${cx + cw / 2 - 60}" y="${photoY + photoH / 2 + 45}" width="120" height="18" fill="#cabf9e"/>

  <g transform="translate(${cx + cw - 78}, ${photoY + 66}) rotate(45)">
    <rect x="-92" y="-13" width="184" height="26" fill="${GOLD}"/>
    <text x="0" y="6" text-anchor="middle" font-family="${MONO}" font-weight="bold" font-size="11" fill="#241c0a">MOOT OF THE YEAR</text>
  </g>

  <text x="${cx + 24}" y="${headlineY}" font-family="${SERIF}" font-weight="bold" font-size="26" fill="${INK}">THIS COULD BE</text>
  <text x="${cx + 24}" y="${headlineY + 32}" font-family="${SERIF}" font-weight="bold" font-size="26" fill="${INK}">YOUR HEADLINE</text>

  <text x="${cx + 24}" y="${cy + ch - 18}" font-family="${MONO}" font-size="13" fill="${RED}">mootoftheyear.bisks.net</text>
</svg>`;

const fontPaths = [
  fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url)),
];
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: SERIF },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

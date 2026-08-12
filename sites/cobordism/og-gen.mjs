// Generates public/og.png — hand-drawn SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (no system fonts on this box, so the font
// is bundled in ./fonts and loaded explicitly). The hero art is the actual
// illustration this site reproduces: two disks joined by a pinched neck.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0d12", FG = "#e8ebf2", DIM = "#8b93a7";
const TOP = "#7ee08a", BOTTOM = "#f0899a", NECK_A = "#ffd23f", NECK_B = "#4fa8ff";

// Illustration center + geometry (an isometric-ish take on the two ellipses
// + pinched tube from the source screenshot).
const cx = 860, cyTop = 210, cyBottom = 470;
const rxOuter = 220, ryOuter = 62;
const rxHole = 60, ryHole = 17;
const waistRx = 34;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="65%" cy="45%" r="60%">
      <stop offset="0" stop-color="#182233"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="neckGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TOP === TOP ? NECK_A : NECK_A}"/>
      <stop offset="1" stop-color="${NECK_B}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${NECK_A}"/>
      <stop offset="1" stop-color="${NECK_B}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- neck: pinched surface between the two disks' holes -->
  <path d="
    M ${cx - rxHole},${cyTop + ryHole}
    C ${cx - waistRx},${(cyTop + cyBottom) / 2 - 40} ${cx - waistRx},${(cyTop + cyBottom) / 2 + 40} ${cx - rxHole},${cyBottom - ryHole}
    A ${rxHole} ${ryHole} 0 0 0 ${cx + rxHole},${cyBottom - ryHole}
    C ${cx + waistRx},${(cyTop + cyBottom) / 2 + 40} ${cx + waistRx},${(cyTop + cyBottom) / 2 - 40} ${cx + rxHole},${cyTop + ryHole}
    A ${rxHole} ${ryHole} 0 0 0 ${cx - rxHole},${cyTop + ryHole}
    Z" fill="url(#neckGrad)" opacity="0.95"/>

  <!-- bottom disk -->
  <ellipse cx="${cx}" cy="${cyBottom}" rx="${rxOuter}" ry="${ryOuter}" fill="${BOTTOM}" opacity="0.92"/>
  <ellipse cx="${cx}" cy="${cyBottom}" rx="${rxHole}" ry="${ryHole}" fill="${BG}"/>

  <!-- top disk -->
  <ellipse cx="${cx}" cy="${cyTop}" rx="${rxOuter}" ry="${ryOuter}" fill="${TOP}" opacity="0.92"/>
  <ellipse cx="${cx}" cy="${cyTop}" rx="${rxHole}" ry="${ryHole}" fill="${BG}"/>

  <!-- wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">cobordism</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="21" fill="${DIM}">two disks, one tube —</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="21" fill="${DIM}">tune it in three.js</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="16" fill="${DIM}">a reply to a thread about an illustration</text>
  <text x="64" y="324" font-family="JetBrains Mono" font-size="16" fill="${DIM}">@minomobi.com's bot couldn't see —</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="16" fill="${DIM}">turns out this one can read images.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${NECK_B}">cobordism.bisks.net</text>
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

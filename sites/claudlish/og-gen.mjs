// Generates public/og.png — the Open Graph preview card for claudlish.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#faf6ee",
  BG2 = "#f1e0d4",
  INK = "#3d3929",
  DIM = "#8a8371",
  ACCENT = "#cc785c",
  BORDER = "#e5ddc8",
  GREEN = "#58cc02";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="80%" cy="-10%" r="65%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${ACCENT}" stroke-width="5"/>

  <text x="70" y="130" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">claudlish</text>
  <text x="70" y="172" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">duolingo for the AI assistant dialect</text>

  <rect x="70" y="230" width="${W - 140}" height="120" rx="14" fill="#ffffff" stroke="${BORDER}" stroke-width="2"/>
  <text x="100" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}" letter-spacing="1">TRANSLATE TO CLAUDLISH</text>
  <text x="100" y="305" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">"No."</text>
  <text x="100" y="336" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${ACCENT}">"I'm not able to help with that." ✓</text>

  <g font-family="JetBrains Mono" font-weight="700" font-size="22">
    <text x="70" y="410" fill="${GREEN}">❤️ ❤️ ❤️</text>
    <text x="260" y="410" fill="${DIM}">3 hearts</text>
    <text x="450" y="410" fill="#ff9500">🔥 12</text>
    <text x="600" y="410" fill="${DIM}">day streak</text>
    <text x="760" y="410" fill="${ACCENT}">✦ 480 xp</text>
  </g>

  <text x="70" y="470" font-family="JetBrains Mono" font-size="20" fill="${DIM}">riffing on @norvid-studies.bsky.social's "Duolingo for Claudlish"</text>

  <text x="70" y="565" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">claudlish.bisks.net</text>
</svg>`;

const fontPaths = [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))];

const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

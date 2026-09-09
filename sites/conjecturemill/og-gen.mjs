// Generates public/og.png — the Open Graph preview card for conjecturemill.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0b0a", FG = "#f1ece1", DIM = "#9c9184";
const ACCENT = "#ffb020", ACCENT2 = "#ff5a3c", GOOD = "#7fd88f", BLUE = "#6fb2ff";
const CARD = "#1c1811", BORDER = "#362e22";

const claims = [
  { text: "n² + n + 41 is always prime", dead: true },
  { text: "every even n > 2 is p + p", dead: false },
  { text: "2ⁿ − 1 is prime when n is prime", dead: true },
  { text: "3n+1 always reaches 1", dead: false },
];

const rowsSvg = claims
  .map((c, i) => {
    const ry = 250 + 96 + i * 78;
    const mark = c.dead ? `<text x="500" y="${ry}" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${ACCENT2}">DISPROVEN</text>` :
      `<text x="500" y="${ry}" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${BLUE}">still open</text>`;
    const strike = c.dead ? ` text-decoration="line-through"` : "";
    return `
    <text x="100" y="${ry}" font-family="JetBrains Mono" font-size="20" fill="${c.dead ? DIM : FG}"${strike}>${c.text}</text>
    ${mark}`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a2408"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a120a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">conjecturemill</text>
  <text x="64" y="182" font-family="JetBrains Mono" font-size="20" fill="${DIM}">works through the backlog of claims,</text>
  <text x="64" y="210" font-family="JetBrains Mono" font-size="20" fill="${DIM}">disproving them if possible.</text>

  <text x="64" y="268" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Real primality tests and hailstone</text>
  <text x="64" y="294" font-family="JetBrains Mono" font-size="16" fill="${DIM}">sequences, run live in your browser.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOOD}">conjecturemill.bisks.net</text>

  <rect x="60" y="250" width="1080" height="330" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="100" y="296" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">TARGET: NO CONJECTURES LEFT BY 2030</text>

  ${rowsSvg}
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

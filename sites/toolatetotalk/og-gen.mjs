// Generates public/og.png — the Open Graph preview card for toolatetotalk.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0d12", FG = "#ecf0f6", DIM = "#8f97ab";
const ACCENT = "#7fd6c9", ACCENT2 = "#c9a6ff", GOLD = "#ffcf7a";
const CARD = "#151922", BORDER = "#262c39";

const names = ["Ada Lovelace", "Alan Turing", "Grace Hopper", "Joseph Weizenbaum", "Steve Jobs", "Stephen Hawking"];
const namesSvg = names
  .map((n, i) => {
    const y = 140 + i * 42;
    return `<text x="700" y="${y}" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${FG}">${n}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1a2230"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="96%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241a2e"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">too late to talk</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">notable people who died before you could</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">just talk to a computer in plain language</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="16" fill="${DIM}">some predicted it. one built the working</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="16" fill="${DIM}">prototype in 1966. one missed the public</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="16" fill="${DIM}">unveiling by about a day.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">toolatetotalk.bisks.net</text>

  <rect x="660" y="58" width="480" height="500" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="700" y="102" font-family="JetBrains Mono" font-weight="800" font-size="14" letter-spacing="2" fill="${DIM}">A FEW OF THEM</text>

  ${namesSvg}
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

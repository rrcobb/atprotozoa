// Generates public/og.png — the static Open Graph preview card for the bare
// followwall link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/topchicken/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#150c1c", INK = "#f7edff", MUTED = "#a68fc0";
const ACCENT = "#c084fc", ACCENT2 = "#f472b6";
const CARD = "#20132a", BORDER = "#392249";

function avatar(cx, cy, r, color, letter) {
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>
    <text x="${cx}" y="${cy + r * 0.35}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="${r}" fill="${BG}">${letter}</text>
  </g>`;
}

const colors = [ACCENT, ACCENT2, "#6fc3ff", "#7ee787", "#f4b400", "#ff8a65"];
let mosaic = "";
const cols = 12, size = 46, gap = 10;
const gridX = 64 + size / 2, gridY = 340 + size / 2;
for (let i = 0; i < cols * 3; i++) {
  const cx = gridX + (i % cols) * (size + gap);
  const cy = gridY + Math.floor(i / cols) * (size + gap);
  mosaic += avatar(cx, cy, size / 2, colors[i % colors.length], "");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="-5%" r="60%">
      <stop offset="0" stop-color="#2c1840"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="60" y="118" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${ACCENT}">🧱 followwall</text>
  <text x="64" y="164" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a website where some people follow this account</text>

  <rect x="64" y="200" width="1072" height="1" fill="${BORDER}"/>

  <text x="64" y="248" font-family="JetBrains Mono" font-size="20" fill="${INK}">Enter a handle → we pull everyone who follows it →</text>
  <text x="64" y="278" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">lay them out as a wall of avatars.</text>

  ${mosaic}

  <text x="64" y="588" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">followwall.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

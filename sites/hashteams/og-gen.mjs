// Generates public/og.png — hashteams' Open Graph preview card. Hand-drawn
// SVG matching public/style.css's dark byte-grid palette, rasterised with
// @resvg/resvg-js. Same recipe as sites/witness/og-gen.mjs and
// sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample (mfzx.net's own worked example, #29811) — the static
// fallback card for the bare link. /team/<n> gets its own personalized
// og:title/description (src/index.ts), but not a distinct image; regenerating
// per team would mean rendering an SVG at request time for every share,
// which isn't worth it for a number that already appears in the title.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0d12", BG_SOFT = "#12151d", INK = "#e7e9ee", INK_SOFT = "#8b93a7";
const ACCENT = "#6ee7c8", BORDER = "#232733", CARD = "#10131a", WARN = "#e78b6e";

function byteBlock(x, y, hex, label) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="86" height="86" rx="10" fill="${BG}" stroke="${ACCENT}" stroke-width="2"/>
      <text x="${x + 43}" y="${y + 52}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${ACCENT}">${hex}</text>
      <text x="${x + 43}" y="${y + 74}" text-anchor="middle" font-family="JetBrains Mono" font-size="12" letter-spacing="1" fill="${INK_SOFT}">${label}</text>
    </g>`;
}

const cardX = 640, cardY = 90, cardW = 500, cardH = 450;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="0%" r="55%">
      <stop offset="0" stop-color="${BG_SOFT}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="${BG_SOFT}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="${INK}">hash<tspan fill="${ACCENT}">teams</tspan></text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="19" fill="${INK_SOFT}">which of 65536 teams is your DID on?</text>

  <text x="66" y="260" font-family="JetBrains Mono" font-size="16" fill="${INK_SOFT}">UTF-8(did) → SHA-256 → first two bytes,</text>
  <text x="66" y="286" font-family="JetBrains Mono" font-size="16" fill="${INK_SOFT}">read big-endian. Enter a handle to see</text>
  <text x="66" y="312" font-family="JetBrains Mono" font-size="16" fill="${WARN}">who else opted into your team.</text>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${INK}">hashteams.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 60}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" letter-spacing="2" fill="${INK_SOFT}">EXAMPLE</text>

  ${byteBlock(cardX + 70, cardY + 90, "0x74", "BYTE 0")}
  ${byteBlock(cardX + 176, cardY + 90, "0x73", "BYTE 1")}
  <text x="${cardX + cardW / 2}" y="${cardY + 230}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${INK_SOFT}">→</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 300}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${ACCENT}">#29811</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 336}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${INK_SOFT}">team of @mfzx.net</text>

  <rect x="${cardX + 60}" y="${cardY + 380}" width="${cardW - 120}" height="8" rx="4" fill="${BG}"/>
  <rect x="${cardX + 60 + (cardW - 120) * (29811 / 65535)}" y="${cardY + 372}" width="6" height="24" rx="3" fill="${ACCENT}"/>
  <text x="${cardX + 60}" y="${cardY + 414}" font-family="JetBrains Mono" font-size="12" fill="${INK_SOFT}">0</text>
  <text x="${cardX + cardW - 60}" y="${cardY + 414}" text-anchor="end" font-family="JetBrains Mono" font-size="12" fill="${INK_SOFT}">65535</text>
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

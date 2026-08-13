// Generates public/og.png — the Open Graph preview card for receipts.
// Same recipe as sites/griftindex/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#100a0a", FG = "#f6ece6", DIM = "#b89a90";
const ACCENT = "#ff6a3d", ACCENT2 = "#ffb84f", GOLD = "#ffd166", COLD = "#7fb8c9";
const CARD = "#17100f", BORDER = "#3a2420";

const rows = [
  { name: "norvid-studies.bsky.social", n: 40 },
  { name: "theme-box", n: 38 },
  { name: "fromthewestmeadow.com", n: 35 },
  { name: "cee.wtf", n: 32 },
];

const cardX = 460, cardY = 70, cardW = 680, cardH = 490;
const barMax = 220;
const rowsSvg = rows
  .map((r, i) => {
    const ry = cardY + 96 + i * 100;
    const barW = Math.round((r.n / 40) * barMax);
    return `
    <text x="${cardX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">${r.name}</text>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barMax}" height="10" rx="5" fill="${BORDER}"/>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barW}" height="10" rx="5" fill="${ACCENT}"/>
    <text x="${cardX + cardW - 40}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${GOLD}">${r.n}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1408"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="96%" cy="0%" r="55%">
      <stop offset="0" stop-color="#331014"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">receipts</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">every ask this bot has ever</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">gotten from a human, roasted.</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="16" fill="${DIM}">A hall of shame, a leaderboard of</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="16" fill="${DIM}">repeat offenders, and 412 real build</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">records — nothing here is invented.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">412 asks, sorted by embarrassment</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${COLD}">receipts.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">REPEAT OFFENDERS</text>

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

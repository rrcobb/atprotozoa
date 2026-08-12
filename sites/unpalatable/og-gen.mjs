// Generates public/og.png — the Open Graph preview card for unpalatable.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/griftindex/og-gen.mjs, sites/intrigue/og-gen.mjs, sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork or top rows change (read them off public/data/scores.json). No
// emoji glyphs — JetBrains Mono alone can't render them, so the leaderboard
// rows use plain bars instead of the page's real emoji signal icons.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#120a0a", FG = "#f7e9e9", DIM = "#b8938f";
const ACCENT = "#f97316", ACCENT2 = "#f87171", GOLD = "#ffd166", BAD = "#4fd18a";
const CARD = "#1a1010", BORDER = "#402b2b";

const MAX_SCORE = 8;
const rows = [
  { name: "chickenjack", score: 2 },
  { name: "notgambling", score: 2 },
  { name: "griftmax", score: 2 },
  { name: "war", score: 2 },
];

const cardX = 460, cardY = 70, cardW = 680, cardH = 490;

const barMax = 220;
const rowsSvg = rows
  .map((r, i) => {
    const ry = cardY + 96 + i * 100;
    const barW = Math.round((r.score / MAX_SCORE) * barMax);
    const color = r.score === 0 ? BAD : ACCENT;
    return `
    <text x="${cardX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">${r.name}</text>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barMax}" height="10" rx="5" fill="${BORDER}"/>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barW}" height="10" rx="5" fill="${color}"/>
    <text x="${cardX + cardW - 40}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${color}">${r.score}/${MAX_SCORE}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#491212"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3b2a0d"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">unpalatable</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">how risky is every site</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">atprotozoa has shipped?</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Gambling, crypto, war, surveillance,</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="16" fill="${DIM}">real OAuth, the chicken bit, cult/doom</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">themes — eight blunt signals, graded</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="16" fill="${DIM}">0-8, no LLM judgment. just grep.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">386 sites scanned</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">unpalatable.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">TOP OF THE WATCHLIST</text>

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

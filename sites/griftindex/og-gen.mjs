// Generates public/og.png — the Open Graph preview card for griftindex.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/intrigue/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. No emoji glyphs — JetBrains Mono alone can't render them,
// so the leaderboard rows use plain bars instead of the page's real emoji
// signal icons.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0a12", FG = "#ece9f7", DIM = "#9a93b8";
const ACCENT = "#4fd1c5", ACCENT2 = "#c084fc", GOLD = "#ffd166", BAD = "#f87171";
const CARD = "#14111f", BORDER = "#2b2540";

const rows = [
  { name: "keytags", score: 4 },
  { name: "clusterpedia", score: 3 },
  { name: "didrank", score: 3 },
  { name: "grindset", score: 0 },
];

const cardX = 460, cardY = 70, cardW = 680, cardH = 490;

const barMax = 220;
const rowsSvg = rows
  .map((r, i) => {
    const ry = cardY + 96 + i * 100;
    const barW = Math.round((r.score / 6) * barMax);
    const color = r.score === 0 ? BAD : ACCENT;
    return `
    <text x="${cardX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">${r.name}</text>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barMax}" height="10" rx="5" fill="${BORDER}"/>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barW}" height="10" rx="5" fill="${color}"/>
    <text x="${cardX + cardW - 40}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${color}">${r.score}/6</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#241249"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0d3b3a"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">griftindex</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">how real is every site</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">atprotozoa has shipped?</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Live firehose, real CAR downloads,</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="16" fill="${DIM}">real OAuth, Durable Objects — six</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">blunt signals, graded 0-6, no LLM</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="16" fill="${DIM}">judgment. just grep. sorted honest.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">273 sites scanned</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">griftindex.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">TOP OF THE LEADERBOARD</text>

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

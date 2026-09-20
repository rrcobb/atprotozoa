// Generates public/og.png — the Open Graph preview card for HumanBENCH.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/griftindex/og-gen.mjs, sites/intrigue/og-gen.mjs and
// sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand whenever
// public/data/entries.json changes, so the card's "top runner" line stays
// honest — it reads straight from that file, not a hand-picked example.

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0f0c", FG = "#e8f3ec", DIM = "#8ba796";
const ACCENT = "#7ee787", ACCENT2 = "#ffd166", GOLD = "#ffd166", BAD = "#f87171";
const CARD = "#131e17", BORDER = "#24382c";

const entriesPath = fileURLToPath(new URL("./public/data/entries.json", import.meta.url));
const entries = JSON.parse(readFileSync(entriesPath, "utf8"));
const top = [...entries].sort((a, b) => b.score - a.score).slice(0, 4);

const cardX = 460, cardY = 70, cardW = 680, cardH = 490;

const barMax = 220;
const rowsSvg = top
  .map((r, i) => {
    const ry = cardY + 96 + i * 100;
    const barW = Math.round((r.score / 10) * barMax);
    const color = r.score === 0 ? BAD : ACCENT;
    return `
    <text x="${cardX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">@${r.handle}</text>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barMax}" height="10" rx="5" fill="${BORDER}"/>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barW}" height="10" rx="5" fill="${color}"/>
    <text x="${cardX + cardW - 40}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${color}">${r.score}/10</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#0f2c1c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a2410"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">HumanBENCH</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">humans, building small apps,</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">graded 0-10 like a model eval</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="16" fill="${DIM}">30-minute speedrun and</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="16" fill="${DIM}">unlimited-time divisions.</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">judged by shimmermathlabs.com,</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="16" fill="${DIM}">real verdicts, no self-reporting.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">${entries.length} run${entries.length === 1 ? "" : "s"} scored so far</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">humanbench.bisks.net</text>

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

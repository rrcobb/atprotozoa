// Generates public/og.png — the Open Graph preview card for niceometer.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed), but
// reads the live leaderboard out of public/data/asks.json instead of a
// hardcoded row list, since this leaderboard is short enough to go stale
// the moment someone new gets a score.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b1210", FG = "#eafaf1", DIM = "#9cbcaf";
const ACCENT = "#6fe3a6", ACCENT2 = "#ffb8d9", GOLD = "#ffd166";
const CARD = "#101b17", BORDER = "#23372f";

const asksPath = fileURLToPath(new URL("./public/data/asks.json", import.meta.url));
const asks = JSON.parse(readFileSync(asksPath, "utf8"));

const totals = {};
for (const a of asks) {
  totals[a.by] = totals[a.by] || { total: 0, count: 0 };
  totals[a.by].total += a.niceScore;
  totals[a.by].count += 1;
}
const ranked = Object.entries(totals)
  .filter(([, v]) => v.total !== 0)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 4)
  .map(([name, v]) => ({ name, n: v.total }));

const maxScore = Math.max(1, ...ranked.map((r) => r.n));
const cardX = 460, cardY = 70, cardW = 680, cardH = 490;
const barMax = 220;
const rowsSvg = ranked
  .map((r, i) => {
    const ry = cardY + 96 + i * 100;
    const barW = Math.max(4, Math.round((Math.abs(r.n) / maxScore) * barMax));
    return `
    <text x="${cardX + 40}" y="${ry}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">${r.name}</text>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barMax}" height="10" rx="5" fill="${BORDER}"/>
    <rect x="${cardX + 40}" y="${ry + 16}" width="${barW}" height="10" rx="5" fill="${ACCENT}"/>
    <text x="${cardX + cardW - 40}" y="${ry}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${GOLD}">+${r.n}</text>`;
  })
  .join("\n");

const scoredCount = ranked.length;
const totalAsks = asks.length;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#123a2a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="96%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1433"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">niceometer</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">ranking buildthis requestors</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">by how nice they've been.</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Scored from quoted, attributed</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="16" fill="${DIM}">words in the bot's own build log —</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">nothing here is invented.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">${scoredCount} scored, out of ${totalAsks} asks total</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">niceometer.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${DIM}">THE LEADERBOARD</text>

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

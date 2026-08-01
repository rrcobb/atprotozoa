// Generates public/og.png — the Open Graph preview card, so a shared link
// auto-renders a picture of the leaderboard in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, matching the live page's dark
// palette, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium needed — this box has no fontconfig/system fonts either, so the
// font is bundled in ./fonts and loaded explicitly). Copied from
// sites/mootstream's og-gen.mjs recipe (itself copied from didscope's) —
// house style: copy, don't abstract.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#08090c";
const PANEL = "#101319";
const BORDER = "#242c38";
const FG = "#eef2f7";
const DIM = "#8892a0";
const ACCENT = "#6fe3c4";
const ACCENT2 = "#ff9d6f";

// A few decorative fake leaderboard rows — bar length is purely for visual
// rhythm, not real data (the live page shows the real thing).
const rows = [
  { name: "did:plc:kx7f...q2n9", count: 812, pct: 1.0 },
  { name: "did:plc:n4bc...7wta", count: 640, pct: 0.79 },
  { name: "did:plc:s91m...jz4k", count: 511, pct: 0.63 },
  { name: "did:plc:2gew...ptbc", count: 398, pct: 0.49 },
];

const ROW_X = 64;
const ROW_W = 720;
const ROW_H = 62;
const ROW_GAP = 14;
const ROWS_TOP = 300;

let rowsSvg = "";
rows.forEach((r, i) => {
  const y = ROWS_TOP + i * (ROW_H + ROW_GAP);
  rowsSvg += `
    <rect x="${ROW_X}" y="${y}" width="${ROW_W}" height="${ROW_H}" rx="10" fill="${PANEL}" stroke="${BORDER}"/>
    <rect x="${ROW_X}" y="${y}" width="${ROW_W * r.pct}" height="${ROW_H}" rx="10" fill="${ACCENT}" opacity="0.10"/>
    <text x="${ROW_X + 22}" y="${y + ROW_H / 2 + 7}" font-family="JetBrains Mono" font-size="15" fill="${DIM}">#${i + 1}</text>
    <circle cx="${ROW_X + 64}" cy="${y + ROW_H / 2}" r="14" fill="${BORDER}"/>
    <text x="${ROW_X + 92}" y="${y + ROW_H / 2 + 6}" font-family="JetBrains Mono" font-size="16" fill="${FG}">${r.name}</text>
    <text x="${ROW_X + ROW_W - 24}" y="${y + ROW_H / 2 + 6}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}" text-anchor="end">${r.count}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="95%" cy="90%" r="60%">
      <stop offset="0" stop-color="${ACCENT2}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">didrank</text>
  <text x="66" y="164" font-family="JetBrains Mono" font-size="22" fill="${DIM}">the most-seen Bluesky DIDs, live off the firehose</text>

  <text x="66" y="230" font-family="JetBrains Mono" font-size="18" fill="${FG}">1m · 5m · 1h · 12h · 24h · weekly · monthly · 6mo · yearly · all-time</text>

  ${rowsSvg}

  <text x="66" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">didrank.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

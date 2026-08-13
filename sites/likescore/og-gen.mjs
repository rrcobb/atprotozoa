// Generates public/og.png — the Open Graph preview card. Hand-drawn SVG at
// the canonical OG size, matching the live page's bureau/observatory
// palette, rasterised with @resvg/resvg-js (already resolvable from the
// repo root's pnpm store — no fresh install needed here). Copied from
// sites/didrank's og-gen.mjs recipe. House style: copy, don't abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "/opt/atprotozoa/node_modules/.pnpm/@resvg+resvg-js@2.6.2/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 1200,
  H = 630;

const BG = "#08090b";
const PANEL = "#101215";
const BORDER = "#2a2323";
const FG = "#e9e6df";
const DIM = "#8b8f92";
const ACCENT = "#cc3b3b";
const LIVE = "#3ba79f";
const WARN = "#d9a63c";

const rows = [
  { name: "westmeadow.bsky.social", pi: 214.7, status: "scanned" },
  { name: "did:plc:kx7f...q2n9", pi: 168.2, status: "scanned" },
  { name: "did:plc:n4bc...7wta", pi: 121.9, status: "provisional" },
];

const ROW_X = 64;
const ROW_W = 620;
const ROW_H = 62;
const ROW_GAP = 14;
const ROWS_TOP = 300;

let rowsSvg = "";
rows.forEach((r, i) => {
  const y = ROWS_TOP + i * (ROW_H + ROW_GAP);
  const statusColor = r.status === "scanned" ? LIVE : WARN;
  rowsSvg += `
    <rect x="${ROW_X}" y="${y}" width="${ROW_W}" height="${ROW_H}" rx="2" fill="${PANEL}" stroke="${BORDER}"/>
    <text x="${ROW_X + 20}" y="${y + ROW_H / 2 + 6}" font-family="JetBrains Mono" font-size="15" fill="${DIM}">#${i + 1}</text>
    <text x="${ROW_X + 64}" y="${y + ROW_H / 2 + 6}" font-family="JetBrains Mono" font-size="16" fill="${FG}">${r.name}</text>
    <rect x="${ROW_X + ROW_W - 190}" y="${y + ROW_H / 2 - 11}" width="90" height="22" rx="2" fill="none" stroke="${statusColor}"/>
    <text x="${ROW_X + ROW_W - 145}" y="${y + ROW_H / 2 + 5}" font-family="JetBrains Mono" font-size="10" letter-spacing="1" fill="${statusColor}" text-anchor="middle">${r.status.toUpperCase()}</text>
    <text x="${ROW_X + ROW_W - 22}" y="${y + ROW_H / 2 + 6}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="#ff8a7a" text-anchor="end">${r.pi}</text>`;
});

// subtle grid, no gradients
let grid = "";
for (let x = 0; x <= W; x += 40) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${ACCENT}" stroke-opacity="0.05"/>`;
for (let y = 0; y <= H; y += 40) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${ACCENT}" stroke-opacity="0.05"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${grid}
  <rect x="0" y="0" width="${W}" height="6" fill="${ACCENT}"/>
  <text x="64" y="120" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="${FG}">likescore</text>
  <text x="64" y="156" font-family="JetBrains Mono" font-size="16" letter-spacing="3" fill="${ACCENT}" opacity="0.85">BUREAU OF RECURSIVE PRESTIGE</text>
  <text x="64" y="210" font-family="JetBrains Mono" font-size="19" fill="${DIM}">who repeatedly likes whom, on bluesky — live, no mocks.</text>
  ${rowsSvg}
  <text x="${W - 64}" y="${H - 36}" font-family="JetBrains Mono" font-size="14" fill="${DIM}" text-anchor="end">likescore.bisks.net</text>
</svg>`;

const fontPath = join(__dirname, "fonts", "JetBrainsMono.ttf");
const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public", "og.png"), png);
console.log("wrote public/og.png", png.length, "bytes");

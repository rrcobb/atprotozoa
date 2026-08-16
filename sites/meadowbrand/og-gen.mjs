// Generates public/og.png — the Open Graph preview card for meadowbrand.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/ceemilarity/og-gen.mjs and sites/norvidfolio/og-gen.mjs.
//
// Reads public/data/brand.json (baked by build-brand.js) so the card uses
// the account's own real numbers and its own derived brand colors — run
// build-brand.js first if that file is missing or stale.
//
//   cp -r ../didscope/node_modules .   # one-time, not a project dependency (gitignored)
//   node og-gen.mjs                    # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// the artwork or the underlying data changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0d10", CARD = "#12151a", BORDER = "#262c34";
const FG = "#f2f3f0", DIM = "#9aa2ad", MUTED = "#6b7280";

const d = JSON.parse(readFileSync(fileURLToPath(new URL("./public/data/brand.json", import.meta.url)), "utf8"));
const { primary, secondary, accent } = d.colors;
const top = d.pillars[0];
const topPct = top ? Math.round((top.count / d.totals.totalRecords) * 100) : 0;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 64, cardY = 64, cardW = W - 128, cardH = H - 128;

const chips = [
  [d.totals.totalRecords.toLocaleString(), "records"],
  [d.voice.count.toLocaleString(), "posts"],
  [d.totals.likes.toLocaleString(), "likes"],
];
const chipW = (cardW - 96 - 24 * 2) / 3;
const chipsSvg = chips
  .map(([n, l], i) => {
    const x = cardX + 48 + i * (chipW + 24);
    const y = cardY + cardH - 150;
    return `
    <rect x="${x}" y="${y}" width="${chipW}" height="90" rx="12" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
    <text x="${x + chipW / 2}" y="${y + 42}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${FG}">${esc(n)}</text>
    <text x="${x + chipW / 2}" y="${y + 68}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${esc(l)}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="${primary}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="96%" cy="105%" r="60%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${primary}"/>
      <stop offset="0.55" stop-color="${secondary}"/>
      <stop offset="1" stop-color="${accent}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <text x="${cardX + 48}" y="${cardY + 78}" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">meadowbrand</text>
  <text x="${cardX + 48}" y="${cardY + 116}" font-family="JetBrains Mono" font-size="21" fill="${DIM}">@${esc(d.handle)}'s brand, read off their CAR file</text>

  <circle cx="${cardX + 56}" cy="${cardY + 176}" r="14" fill="${primary}"/>
  <circle cx="${cardX + 92}" cy="${cardY + 176}" r="14" fill="${secondary}"/>
  <circle cx="${cardX + 128}" cy="${cardY + 176}" r="14" fill="${accent}"/>

  <text x="${cardX + 48}" y="${cardY + 268}" font-family="JetBrains Mono" font-weight="800" font-size="96" fill="${FG}">${topPct}%</text>
  <text x="${cardX + 48}" y="${cardY + 306}" font-family="JetBrains Mono" font-size="22" fill="${DIM}">of every record they've ever written is ${esc(top ? top.title : "unaccounted for")}</text>

  ${chipsSvg}

  <text x="${cardX + 48}" y="${cardY + cardH - 28}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${accent}">meadowbrand.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.error(`wrote public/og.png (${topPct}% ${top ? top.title : "?"})`);

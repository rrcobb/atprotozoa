// Generates public/og.png — the Open Graph preview card for moottld, so a
// shared link auto-renders a picture of a census in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's ledger look, rasterised with @resvg/resvg-js (pure native module,
// no system Chromium needed — this box has no fontconfig/system fonts
// either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample census (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-handle share cards are generated
// live, client-side, in public/index.html (buildShareCard); per-handle
// og:title/og:description text (not image) is personalized server-side by
// src/index.ts's /s/<handle> route.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0c10", FG = "#e8ecf2", DIM = "#8891a3";
const ACCENT = "#ffb648", ACCENT2 = "#57e0c2", CARD = "#12151c", BORDER = "#262b36", BAR = "#1c2230";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

const stats = [
  ["185", "mutuals"],
  ["60", "unique TLDs"],
  ["16.2", "avg length"],
];
const colW = cardW / 3;

const statsSvg = stats
  .map(([n, l], i) => {
    const cx = cardX + colW * i + colW / 2;
    return `<text x="${cx}" y="${cardY + 80}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${ACCENT2}">${n}</text>
    <text x="${cx}" y="${cardY + 108}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">${l}</text>`;
  })
  .join("\n    ");

const tldRows = [
  [".social", 53],
  [".com", 15],
  [".dev", 10],
  [".net", 9],
  [".systems", 8],
  [".moe", 7],
];
const maxCount = tldRows[0][1];
const barX = cardX + 170;
const barMaxW = cardW - 260;

const tldSvg = tldRows
  .map(([tld, count], i) => {
    const y = cardY + 210 + i * 34;
    const bw = Math.max(6, (count / maxCount) * barMaxW);
    return `<text x="${cardX + 48}" y="${y}" font-family="JetBrains Mono" font-weight="600" font-size="18" fill="${FG}">${tld}</text>
    <rect x="${barX}" y="${y - 16}" width="${barMaxW}" height="14" fill="${BAR}"/>
    <rect x="${barX}" y="${y - 16}" width="${bw}" height="14" fill="url(#bar)"/>
    <text x="${barX + barMaxW + 16}" y="${y}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">${count}</text>`;
  })
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a230f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0d2621"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT2}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">moottld</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">census your <tspan fill="${ACCENT2}">mutuals</tspan> by</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">TLD, segments, length</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get a real</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">follows ∩ followers census — TLDs,</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">handle length, the works.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">moottld.bisks.net</text>

  <!-- right: sample census card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  ${statsSvg}
  <line x1="${cardX + 32}" y1="${cardY + 140}" x2="${cardX + cardW - 32}" y2="${cardY + 140}" stroke="${BORDER}" stroke-width="1"/>

  <text x="${cardX + 48}" y="${cardY + 178}" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="2" fill="${ACCENT}">TOP TLDS</text>
  ${tldSvg}
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

// Generates public/og.png — the Open Graph preview card for disturbedgamers,
// so a shared bare link auto-renders a picture of the tool instead of a
// blank card. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Same recipe as sites/steamstats/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is the generic fallback card for the bare link (sample names, not
// tied to any real account). Per-run share cards get their own
// og:title/description server-side once analyzed (src/index.ts's /s/<list>).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0708", BG2 = "#17100f", FG = "#f2e9e4", DIM = "#97817e";
const ACCENT = "#ff4d3d", ACCENT2 = "#ff8a5c", BORDER = "#3a201d";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 64, cardY = 190, cardW = 1072, cardH = 380;
const board = [
  ["1", "sole_survivor", "38.4"],
  ["2", "outlast_and_proud", "26.1"],
  ["3", "hookedonyou", "19.7"],
];

const boardSvg = board
  .map(([rank, name, pts], i) => {
    const y = cardY + 188 + i * 58;
    return `<text x="${cardX + 48}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}">#${rank}</text>
    <text x="${cardX + 96}" y="${y}" font-family="JetBrains Mono" font-size="24" fill="${FG}">${esc(name)}</text>
    <text x="${cardX + cardW - 48}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">${esc(pts)} pts</text>`;
  })
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="18%" cy="-8%" r="60%">
      <stop offset="0" stop-color="#3a0e0e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="4%" r="55%">
      <stop offset="0" stop-color="#1e0a12"/>
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

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">disturbedgamers</text>
  <text x="64" y="136" font-family="JetBrains Mono" font-size="20" fill="${DIM}">disturbedgamers.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${BG2}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + 48}" y="${cardY + 56}" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">MOST DISTURBED HORROR GAMERS</text>
  ${boardSvg}

  <text x="${cardX + 48}" y="${cardY + cardH - 26}" font-family="JetBrains Mono" font-size="17" fill="${DIM}">score = Σ log2(1 + hours) across every horror game logged</text>

  <text x="64" y="580" font-family="JetBrains Mono" font-size="19" fill="${DIM}">paste public Steam profiles — no API key, no login. plus: who's most disturbingly compatible.</text>
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

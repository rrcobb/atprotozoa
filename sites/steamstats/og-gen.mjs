// Generates public/og.png — the Open Graph preview card for steamstats, so a
// shared bare link auto-renders a picture of the tool instead of a blank
// card. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is the generic fallback card for the bare link (a sample profile, not
// tied to any real account). Per-profile share cards are generated live,
// client-side, in public/index.html (buildShareCard), and per-profile /s/<x>
// pages get their own og:title/description server-side (src/index.ts).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0e1621", BG2 = "#16202d", FG = "#e9f2fb", DIM = "#7f9cb8";
const ACCENT = "#66c0f4", ACCENT2 = "#a4d007", BORDER = "#2a3f5a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 64, cardY = 190, cardW = 1072, cardH = 380;
const games = [
  ["Path of Exile", "1,355h"],
  ["Warframe", "1,637h"],
  ["Half-Life 2", "62h"],
];

const gamesSvg = games
  .map(([name, hrs], i) => {
    const y = cardY + 220 + i * 44;
    return `<text x="${cardX + 48}" y="${y}" font-family="JetBrains Mono" font-size="22" fill="${FG}">${esc(name)}</text>
    <text x="${cardX + cardW - 48}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-size="20" fill="${DIM}">${hrs}</text>`;
  })
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="18%" cy="-8%" r="60%">
      <stop offset="0" stop-color="#16324a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="4%" r="55%">
      <stop offset="0" stop-color="#223a1a"/>
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

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">steamstats</text>
  <text x="64" y="136" font-family="JetBrains Mono" font-size="20" fill="${DIM}">steamstats.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${BG2}" stroke="${BORDER}" stroke-width="1.5"/>

  <rect x="${cardX + 48}" y="${cardY + 48}" width="108" height="108" rx="12" fill="${BORDER}"/>
  <text x="${cardX + 48 + 54}" y="${cardY + 48 + 66}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="40" fill="${DIM}">?</text>

  <text x="${cardX + 228}" y="${cardY + 90}" font-family="JetBrains Mono" font-weight="700" font-size="40" fill="${FG}">any Steam account</text>
  <text x="${cardX + 228}" y="${cardY + 128}" font-family="JetBrains Mono" font-weight="600" font-size="24" fill="${ACCENT2}">level · member-since age · ban flags</text>

  <text x="${cardX + 48}" y="${cardY + 190}" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">RECENT / MOST-PLAYED</text>
  ${gamesSvg}

  <text x="64" y="580" font-family="JetBrains Mono" font-size="19" fill="${DIM}">paste a vanity name, SteamID64, or profile URL — no API key, no login.</text>
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

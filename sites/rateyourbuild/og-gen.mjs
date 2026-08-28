// Generates public/og.png — the Open Graph preview card for rateyourbuild.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (same recipe as sites/steamtags/og-gen.mjs — pure native module, no system
// Chromium/fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", BG2 = "#f7f9fa", INK = "#0f1419", MUTED = "#536471";
const ACCENT = "#7856ff", GOOD = "#00ba7c", MID = "#b8860b", FAINT = "#e1e8ed";

const rows = [
  { name: "steamtags", score: "9.1", n: 42 },
  { name: "tallybot", score: "8.4", n: 19 },
  { name: "receipts", score: "7.9", n: 63 },
  { name: "rateyourbuild", score: "??", n: 0 },
];

const rowsSvg = rows
  .map((r, i) => {
    const y = 386 + i * 62;
    const color = r.n === 0 ? MUTED : i === 0 ? GOOD : i === 1 ? GOOD : MID;
    return `
    <rect x="64" y="${y - 34}" width="1072" height="48" rx="10" fill="${BG2}"/>
    <text x="88" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">${r.name}</text>
    <text x="1112" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${color}">${r.score}${r.n ? ` <tspan fill="${MUTED}" font-weight="400" font-size="18">(${r.n})</tspan>` : ""}</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="10%" cy="-10%" r="65%">
      <stop offset="0" stop-color="#efe9ff"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${GOOD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">rateyourbuild</text>
  <text x="66" y="200" font-family="JetBrains Mono" font-size="27" fill="${MUTED}">RateYourMusic for a bot's back catalog</text>

  <text x="66" y="280" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">Rate every site @buildthis.bisks.net has built, 0 to 10 —</text>
  <text x="66" y="308" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">weighted by vote count, genre charts, a prompters leaderboard.</text>

  ${rowsSvg}

  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="url(#title)"/>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log(`wrote public/og.png (${png.length} bytes)`);

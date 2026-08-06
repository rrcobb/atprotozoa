// Generates public/og.png — the Open Graph preview card for shipname.
// One name pair fanning out into a handful of colored combo chips, mirroring
// the on-page result grid. Drawn shapes + mono-font text, not emoji (the
// bundled font has no color-emoji glyphs and resvg would render tofu — same
// reasoning as sites/lovelanguage/og-gen.mjs and sites/warmhug/og-gen.mjs).
// Rasterised with @resvg/resvg-js (pure native module, no system
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

const BG1 = "#1b0f2e", BG2 = "#0f0820";
const INK = "#fff0fa", DIM = "#c3a8dd";
const PINK = "#ff6fae", GOLD = "#ffd166", MINT = "#6ff2c9";

const COMBOS = [
  { label: "Alory", tag: "the classic", color: "#ff6fae" },
  { label: "Roalex", tag: "reverse classic", color: "#ffd166" },
  { label: "Alrory", tag: "power couple", color: "#6ff2c9" },
  { label: "Roex", tag: "speedrun", color: "#7fb8ff" },
];

const bubbleX = 700, bubbleY = 118, bubbleW = 400, bubbleH = 90;
const bubbleCx = bubbleX + bubbleW / 2, bubbleCy = bubbleY + bubbleH / 2 + 12;

const chipX = 700, chipW = 430, chipH = 66, chipGap = 18, chipsTop = 250;

let chipsSvg = "";
let linesSvg = "";
COMBOS.forEach((s, i) => {
  const cy = chipsTop + i * (chipH + chipGap);
  linesSvg += `<line x1="${bubbleCx}" y1="${bubbleCy}" x2="${chipX + 26}" y2="${cy + chipH / 2}" stroke="${s.color}" stroke-width="2" opacity="0.45"/>`;
  chipsSvg += `
  <rect x="${chipX}" y="${cy}" width="${chipW}" height="${chipH}" rx="16" fill="rgba(255,255,255,0.06)" stroke="${s.color}" stroke-width="2.5"/>
  <text x="${chipX + 26}" y="${cy + 34}" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${INK}">${s.label}</text>
  <text x="${chipX + 26}" y="${cy + 54}" font-family="JetBrains Mono" font-size="15" fill="${s.color}">${s.tag}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${PINK}" stop-opacity="0.26"/>
      <stop offset="1" stop-color="${PINK}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="50%">
      <stop offset="0" stop-color="${MINT}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${MINT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PINK}"/>
      <stop offset="0.55" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${MINT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">shipname</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">the couple-nickname machine</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Two names in, an unreasonable</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">number of couple nicknames</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">out. Reroll for chaos mode.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">shipname.bisks.net</text>

  ${linesSvg}

  <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="20" fill="rgba(255,255,255,0.08)" stroke="${INK}" stroke-width="2" opacity="0.9"/>
  <path d="M ${bubbleX + 50} ${bubbleY + bubbleH} L ${bubbleX + 30} ${bubbleY + bubbleH + 22} L ${bubbleX + 76} ${bubbleY + bubbleH} Z" fill="rgba(255,255,255,0.08)" stroke="${INK}" stroke-width="2" opacity="0.9"/>
  <text x="${bubbleCx}" y="${bubbleCy - 4}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">Alex + Rory = ?</text>

  ${chipsSvg}
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

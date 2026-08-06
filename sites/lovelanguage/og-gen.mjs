// Generates public/og.png — the Open Graph preview card for lovelanguage.
// One message fanning out into five colored chips, one per love language.
// Drawn shapes + mono-font text, not emoji (the bundled font has no
// color-emoji glyphs and resvg would render tofu — same reasoning as
// sites/warmhug/og-gen.mjs and sites/gratitude-garden/og-gen.mjs).
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

const BG1 = "#2a1420", BG2 = "#180a12";
const INK = "#fff3ee", DIM = "#d9b8c4";
const GIFTS = "#ff8fab", WORDS = "#ffcb5c", TIME = "#c9a6ff";

const STYLES = [
  { label: "words of affirmation", color: "#ffcb5c" },
  { label: "acts of service", color: "#6fc3ff" },
  { label: "receiving gifts", color: "#ff8fab" },
  { label: "quality time", color: "#c9a6ff" },
  { label: "physical touch", color: "#7fe0a8" },
];

const bubbleX = 760, bubbleY = 118, bubbleW = 340, bubbleH = 90;
const bubbleCx = bubbleX + bubbleW / 2, bubbleCy = bubbleY + bubbleH / 2 + 12;

const chipX = 700, chipW = 430, chipH = 58, chipGap = 18, chipsTop = 250;

let chipsSvg = "";
let linesSvg = "";
STYLES.forEach((s, i) => {
  const cy = chipsTop + i * (chipH + chipGap);
  const cx = chipX + chipW / 2;
  linesSvg += `<line x1="${bubbleCx}" y1="${bubbleCy}" x2="${chipX + 26}" y2="${cy + chipH / 2}" stroke="${s.color}" stroke-width="2" opacity="0.45"/>`;
  chipsSvg += `
  <rect x="${chipX}" y="${cy}" width="${chipW}" height="${chipH}" rx="14" fill="rgba(255,255,255,0.06)" stroke="${s.color}" stroke-width="2.5"/>
  <circle cx="${chipX + 30}" cy="${cy + chipH / 2}" r="7" fill="${s.color}"/>
  <text x="${chipX + 52}" y="${cy + chipH / 2 + 7}" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${INK}">${s.label}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="12%" cy="-8%" r="55%">
      <stop offset="0" stop-color="${GIFTS}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="${GIFTS}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="50%">
      <stop offset="0" stop-color="${TIME}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${TIME}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GIFTS}"/>
      <stop offset="0.55" stop-color="${WORDS}"/>
      <stop offset="1" stop-color="${TIME}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">lovelanguage</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">say it in their language</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Type a message, see how it</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">lands rephrased five ways —</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">one for each love language.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${WORDS}">lovelanguage.bisks.net</text>

  ${linesSvg}

  <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="20" fill="rgba(255,255,255,0.08)" stroke="${INK}" stroke-width="2" opacity="0.9"/>
  <path d="M ${bubbleX + 50} ${bubbleY + bubbleH} L ${bubbleX + 30} ${bubbleY + bubbleH + 22} L ${bubbleX + 76} ${bubbleY + bubbleH} Z" fill="rgba(255,255,255,0.08)" stroke="${INK}" stroke-width="2" opacity="0.9"/>
  <text x="${bubbleCx}" y="${bubbleCy - 4}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">"I love you"</text>

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

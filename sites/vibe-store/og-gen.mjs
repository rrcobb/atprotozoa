// Generates public/og.png — the Open Graph preview card for the vibe store.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is bundled
// in ./fonts and loaded explicitly). Copied from sites/padmoot/og-gen.mjs.
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

const BG = "#0a0f12", INK = "#e8f4ee", DIM = "#7c9089";
const LIME = "#b6ff3c", PINK = "#ff5ec8", CARD = "#131c22", BORDER = "#2c3a3f";

// A little receipt-style shopping list, some items crossed out.
const ITEMS = [
  { label: "tiny synth", done: true },
  { label: "pigeon dueling sim", done: true },
  { label: "oauth-gated guestbook", done: false },
  { label: "??? (your order here)", done: false },
];

const listX = 700, listY = 260, listW = 430, rowH = 62;
let rows = "";
ITEMS.forEach((item, i) => {
  const y = listY + i * rowH;
  const boxColor = item.done ? LIME : DIM;
  rows += `
  <rect x="${listX}" y="${y}" width="${listW}" height="${rowH - 14}" rx="10" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <text x="${listX + 22}" y="${y + 33}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${boxColor}">${item.done ? "[x]" : "[ ]"}</text>
  <text x="${listX + 88}" y="${y + 33}" font-family="JetBrains Mono" font-size="20" fill="${item.done ? DIM : INK}" ${item.done ? `text-decoration="line-through"` : ""}>${item.label}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#1c2e10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="100%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2e1023"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${LIME}"/>
      <stop offset="1" stop-color="${PINK}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">the vibe store</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="24" fill="${DIM}">sign in with Bluesky, place an order,</text>
  <text x="64" y="234" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a coding agent builds it.</text>

  <text x="64" y="310" font-family="JetBrains Mono" font-size="18" fill="${DIM}">real orders — it tags</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${PINK}">@buildthis.bisks.net</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="18" fill="${DIM}">for real, no mock checkout.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${LIME}">bisks.net/vibe-store</text>

  ${rows}
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

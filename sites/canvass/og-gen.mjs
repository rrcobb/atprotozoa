// Generates public/og.png — the Open Graph preview card for canvass.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/guestbet, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b";
const ACCENT = "#1a5fd0", GOOD = "#1f8a4c";
const CARD = "#f6f6f6", BORDER = "#e4e4e4";

const cardX = 660, cardY = 150, cardW = 480, cardH = 330;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${INK}">canvass</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">rally real votes for a Simcluster nominee</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">Make a rally card, share it, send real people to</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">cast their own one vote. No bots — the board</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">rate-limits those anyway, and it isn't the point.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">canvass.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 56}" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="2" fill="${ACCENT}">RALLY CARD</text>
  <text x="${cardX + 40}" y="${cardY + 128}" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${INK}">VOTE FOR</text>
  <text x="${cardX + 40}" y="${cardY + 168}" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${ACCENT}">@croissanthology.com</text>
  <text x="${cardX + 40}" y="${cardY + 214}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">on Simcluster</text>
  <text x="${cardX + 40}" y="${cardY + 244}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">simcluster-guests.bisks.net</text>
  <text x="${cardX + 40}" y="${cardY + 296}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${GOOD}">one honest vote &gt; a thousand fake ones</text>
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

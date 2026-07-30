// Generates public/og.png — the static Open Graph card for bisksipedia's
// home page (and the fallback used wherever a live article has no photo of
// its own). Parchment/encyclopedia palette, rasterised with @resvg/resvg-js
// the same way sites/didscope does it (no system fonts on this box, so the
// font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#f4f1e9", CARD = "#fbfaf6", INK = "#202122", MUTED = "#54595d";
const BORDER = "#a2a9b1", ACCENT = "#0645ad";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 60, cardY = 60, cardW = W - 120, cardH = H - 120;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="6" fill="${INK}"/>

  <text x="${W / 2}" y="255" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="86" fill="${INK}">bisksipedia</text>
  <text x="${W / 2}" y="305" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">the free encyclopedia nobody asked for</text>

  <line x1="${cardX + 90}" y1="360" x2="${W - cardX - 90}" y2="360" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,5"/>

  <text x="${W / 2}" y="400" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${INK}">Poster: a Bluesky account, auto-rendered by handle or DID</text>
  <text x="${W / 2}" y="432" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${INK}">Post: a single skeet, auto-rendered by author + rkey</text>
  <text x="${W / 2}" y="464" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${INK}">Feed: a custom feed generator, auto-rendered by publisher + rkey</text>

  <text x="${W / 2}" y="530" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">wiki.bisks.net</text>
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

// Generates public/og.png — the Open Graph preview card for gongguo, so a
// shared link auto-renders a picture of the ledger in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's ink-and-parchment ledger look, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample ledger (not tied to any real handle) — this is the
// static fallback card for the bare link. Per-account share cards are
// generated live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#130d08", FG = "#f3e6cf", DIM = "#b39c78";
const ACCENT = "#c1272d", ACCENT2 = "#d4af37", CARD = "#201810", BORDER = "#4a3a24";
const GOOD = "#6fae63";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const netScore = "+37";
const tierName = "Merit Ahead, Modestly";
const tierDesc = "merit outweighs demerit, for now";
const lines = [
  { delta: "+8", label: "follows generously, expects little back", good: true },
  { delta: "+5", label: "restraint in speech — a mere 14 posts", good: true },
  { delta: "-3", label: "quote-posted just to dunk, added nothing", good: false },
  { delta: "+10", label: "defended a friend's name in absentia", good: true },
];

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
let ly = cardY + 210;
const lineRows = lines.map((l) => {
  const row = `
    <text x="${cardX + 68}" y="${ly}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${l.good ? GOOD : ACCENT}">${l.delta}</text>
    <text x="${cardX + 120}" y="${ly}" font-family="JetBrains Mono" font-size="18" fill="${FG}">${esc(l.label)}</text>`;
  ly += 32;
  return row;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1a12"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#2a220a"/>
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

  <!-- left: wordmark + pitch. No CJK glyphs here on purpose — the only
       bundled font is JetBrainsMono.ttf (Latin-only), and resvg with
       loadSystemFonts:false has no fallback, so Chinese text would rasterize
       as tofu. The live page renders 功過格 etc. fine via browser font
       fallback (see index.html); this static card stays English-only. -->
  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">gongguo</text>
  <text x="64" y="168" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">a ledger of merit &amp; demerit</text>

  <text x="64" y="230" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Score your Bluesky account like</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-size="20" fill="${DIM}">a 1604 Chinese Buddhist self-</text>
  <text x="64" y="282" font-family="JetBrains Mono" font-size="20" fill="${DIM}">examination ledger — merit and</text>
  <text x="64" y="308" font-family="JetBrains Mono" font-size="20" fill="${DIM}">demerit, tallied and confessed.</text>

  <text x="64" y="374" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a handle. Get an automatic</text>
  <text x="64" y="400" font-family="JetBrains Mono" font-size="17" fill="${DIM}">reading, then confess the rest.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">gongguo.bisks.net</text>

  <!-- right: sample ledger card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 88}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${ACCENT2}">${netScore}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 128}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${FG}">${tierName}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 152}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">${esc(tierDesc)}</text>

  <line x1="${cardX + 48}" y1="${cardY + 178}" x2="${cardX + cardW - 48}" y2="${cardY + 178}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <rect x="${cardX + 48}" y="${cardY + 190}" width="4" height="${lines.length * 32 + 6}" fill="${ACCENT}"/>
  ${lineRows}
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

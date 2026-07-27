// Generates public/og.png — the Open Graph preview card for Wu-Tang Clam, so
// a shared link auto-renders a picture of a membership card in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample chamber (not tied to any real handle) — this is the
// static fallback card for the bare link. Per-handle share cards are
// generated live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070707", FG = "#f1e6c8", DIM = "#b8ac86";
const GOLD = "#d8a833", GOLD_BRIGHT = "#ffd25e", RED = "#e6402f", CARD = "#171310", BORDER = "#4a3c1e";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && test.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const chamberLabel = "CHAMBER VII";
const wuName = "SHAOLIN QUAHOG";
const prophecy = "Nobody's ever landed a hit while you were still talking.";
const guardian = "Guardian: RZA";

const prophecyLines = wrapLines(prophecy, 40);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 90;
const chamberY = y;
y += 40;
const nameY1 = y;
y += 56;
const nameY2 = y;
y += 60;
const prophecyStartY = y;
const prophecyLineH = 32;
y += prophecyLines.length * prophecyLineH + 30;
const guardianY = y;

const nameParts = wuName.split(" ");

const prophecySvg = prophecyLines
  .map((l, i) => `<text x="${cardX + cardW / 2}" y="${prophecyStartY + i * prophecyLineH}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="22" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="20%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#241b0a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD_BRIGHT}"/>
      <stop offset="1" stop-color="${RED}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">WU-TANG CLAM</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the unofficial, unaffiliated,</text>
  <text x="64" y="198" font-family="JetBrains Mono" font-size="19" fill="${DIM}">extremely 1997 fan shack</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Your atproto DID, read like a</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${DIM}">kung-fu scroll and a tide chart</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${DIM}">at once. Find your Wu-Clam name.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD_BRIGHT}">bisks.net/wutangclam</text>

  <!-- right: sample membership card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${CARD}" stroke="${GOLD}" stroke-width="3"/>
  <rect x="${cardX + 10}" y="${cardY + 10}" width="${cardW - 20}" height="${cardH - 20}" fill="none" stroke="${BORDER}" stroke-width="1"/>

  <text x="${cardX + cardW / 2}" y="${chamberY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" letter-spacing="3" fill="${RED}">${chamberLabel}</text>
  <text x="${cardX + cardW / 2}" y="${nameY1}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD_BRIGHT}">${esc(nameParts[0])}</text>
  <text x="${cardX + cardW / 2}" y="${nameY2}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD_BRIGHT}">${esc(nameParts.slice(1).join(" "))}</text>

  ${prophecySvg}

  <text x="${cardX + cardW / 2}" y="${guardianY}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">${esc(guardian)}</text>
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

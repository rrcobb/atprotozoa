// Generates public/og.png — the Open Graph preview card for cursekind, so a
// shared link auto-renders a picture of the gauge in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's curse-to-kind gauge look, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample reading (not tied to any real handle) — this is the
// static fallback card for the bare link. Per-account share cards are
// generated live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0710", FG = "#f4eef9", DIM = "#9c8bae";
const CURSE = "#b34cff", CURSE2 = "#6a1b9a", KIND = "#ffcf5c", KIND2 = "#d99a1c";
const CARD = "#150d1c", BORDER = "#2c1f38";

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

const name = "NAME";
const verdict = "leans kind.";
const avg = 0.32; // -1 (curse) .. +1 (kind)
const quote = "“finally sat down and finished the thing, actually proud of it”";

const cardX = 470, cardY = 90, cardW = 668, cardH = 450;
const verdictLines = wrapLines(verdict, 22);
const quoteLines = wrapLines(quote, 44);

const barX = cardX + 44, barY = cardY + 160, barW = cardW - 88, barH = 26;
const markerX = barX + ((avg + 1) / 2) * barW;

const verdictSvg = verdictLines
  .map((l, i) => `<text x="${cardX + cardW / 2}" y="${cardY + 70 + i * 42}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="32" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const quoteSvg = quoteLines
  .map((l, i) => `<text x="${barX}" y="${barY + 150 + i * 26}" font-family="JetBrains Mono" font-style="italic" font-size="17" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#2c123f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="50%">
      <stop offset="0" stop-color="#3a2807"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CURSE}"/>
      <stop offset="1" stop-color="${KIND}"/>
    </linearGradient>
    <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CURSE2}"/>
      <stop offset="0.25" stop-color="${CURSE}"/>
      <stop offset="0.5" stop-color="${BORDER}"/>
      <stop offset="0.75" stop-color="${KIND}"/>
      <stop offset="1" stop-color="${KIND2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">cursekind</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">where does this account</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">fall, <tspan fill="${CURSE}">CURSE</tspan> to <tspan fill="${KIND}">KIND</tspan>?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a handle. Their last 10 posts</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">each get scored by a real in-browser</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">sentiment model — transformers.js.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${KIND}">cursekind.bisks.net</text>

  <!-- right: sample gauge card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  ${verdictSvg}

  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="13" fill="url(#gaugeGrad)"/>
  <circle cx="${markerX}" cy="${barY + barH / 2}" r="11" fill="${FG}" stroke="${BG}" stroke-width="3"/>

  <text x="${barX}" y="${barY + barH + 40}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${CURSE}">${name}CURSE</text>
  <text x="${barX + barW}" y="${barY + barH + 40}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${KIND}">${name}KIND</text>

  <line x1="${barX}" y1="${barY + 100}" x2="${cardX + cardW - 44}" y2="${barY + 100}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${barX}" y="${barY + 130}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${KIND}">KINDEST OF THE LAST 10</text>
  ${quoteSvg}
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

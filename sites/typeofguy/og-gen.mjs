// Generates public/og.png — the Open Graph preview card for typeofguy, so a
// shared link auto-renders a picture of a specimen card in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's field-guide look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
// Same recipe as sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A fixed sample specimen (not tied to any real seed) — this is the static
// fallback card for the bare link. Per-guy share cards are generated live,
// client-side, in public/index.html (buildShareCard), and per-guy /s/<seed>
// links get their own og:title/description text (not image) from
// src/index.ts's renderShare.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#efe6d0", INK = "#2b2013", DIM = "#6b5c42";
const CARD = "#f7f0dd", STAMP = "#a13d2c", ACCENT = "#3c5c3c";

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

const specimenNo = "0142";
const binomial = "Guyus panificus narrans";
const sentence =
  "the sourdough guy who explains the plot of a movie you've both already seen, " +
  "and, somehow also, has a starter culture named after an ex (unprompted.)";

const sentenceLines = wrapLines(sentence, 46);

const cardX = 60, cardY = 60, cardW = W - 120, cardH = H - 120;
const lineH = 44;

const sentenceSvg = sentenceLines
  .map((l, i) => `<text x="${cardX + 48}" y="${cardY + 210 + i * lineH}" font-family="JetBrains Mono" font-weight="500" font-size="30" fill="${INK}">${esc(l)}</text>`)
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${CARD}" stroke="${INK}" stroke-width="3"/>

  <text x="${cardX + 48}" y="${cardY + 66}" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${INK}">typeofguy.</text>
  <text x="${cardX + cardW - 48}" y="${cardY + 66}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${STAMP}">SPECIMEN No. ${specimenNo}</text>

  <line x1="${cardX + 48}" y1="${cardY + 96}" x2="${cardX + cardW - 48}" y2="${cardY + 96}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4,5"/>

  <text x="${cardX + 48}" y="${cardY + 150}" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${ACCENT}">${esc(binomial)}</text>

  ${sentenceSvg}

  <text x="${cardX + 48}" y="${cardY + cardH - 36}" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${DIM}">typeofguy.bisks.net</text>
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

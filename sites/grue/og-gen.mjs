// Generates public/og.png — the static Open Graph preview card for grue (the
// generic, non-per-result card; per-line share cards are drawn live,
// client-side, in public/index.html's drawShareCard). Hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly). Adapted from sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";
const GRUE = "#1f8a4c", BLEEN = "#1a5fd0";

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

const sample =
  "since it's more or less a remark on how nelson goodman's new riddle of induction cast in terms of gemeralds & coalsop illustrates the duality of the ancient yin & yang";
const sampleLines = wrapLines(sample, 40);

const cardX = 60, cardY = 250, cardW = W - 120, cardH = H - 340;
const lineH = 34;
let textY = cardY + 56;
const textSvg = sampleLines
  .slice(0, 6)
  .map((l, i) => `<text x="${cardX + 40}" y="${textY + i * lineH}" font-family="JetBrains Mono" font-size="26" fill="${INK}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="10" fill="${GRUE}"/>
  <rect y="${H - 10}" width="${W}" height="10" fill="${BLEEN}"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">grue</text>
  <text x="60" y="132" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">a godoglyness markov chain</text>

  <text x="60" y="180" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">godoglyness</text>
  <text x="60" y="203" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">@godoglyness.bsky.social · synthetic</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${FAINTBG}" stroke="${FAINT}" stroke-width="1.5"/>
  ${textSvg}

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${BLEEN}">grue.bisks.net</text>
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

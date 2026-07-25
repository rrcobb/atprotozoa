// Generates public/og.png — the Open Graph preview card for didscope, so a
// shared link auto-renders a picture of a reading in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's neon-astrology look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample reading (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-reading share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0710", BG2 = "#150c22", FG = "#f2e9ff", DIM = "#a996c4";
const ACCENT = "#ff5fd1", ACCENT2 = "#6ef2c9", CARD = "#1c1128", BORDER = "#3a2650";

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

const glyph = "V";
const signName = "The Vibe Coder";
const signChar = "DID ends in “v”";
const reading = "You do not read the code. Have never read the code. Deadlines wait for no one.";
const omen = "“shipped it, didn’t test it, felt something close to peace”";

const readingLines = wrapLines(reading, 58);
const omenLines = wrapLines(omen, 66);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 78;
const glyphY = y;
y += 92;
const signNameY = y;
y += 34;
const signCharY = y;
y += 44;
const readingStartY = y;
const readingLineH = 30;
y += readingLines.length * readingLineH + 34;
const omenLabelY = y;
y += 30;
const omenStartY = y;
const omenLineH = 26;

const readingSvg = readingLines
  .map((l, i) => `<text x="${cardX + 48}" y="${readingStartY + i * readingLineH}" font-family="JetBrains Mono" font-size="21" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const omenSvg = omenLines
  .map((l, i) => `<text x="${cardX + 48}" y="${omenStartY + i * omenLineH}" font-family="JetBrains Mono" font-style="italic" font-size="16" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="20%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1a52"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#12324a"/>
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

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">didscope</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">your <tspan fill="${ACCENT2}">did:plc</tspan> is your</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">horoscope</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get a real</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">sign, a rival, and one real recent</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">post as today's omen.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">didscope.bisks.net</text>

  <!-- right: sample reading card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${glyphY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="72" fill="${ACCENT2}">${glyph}</text>
  <text x="${cardX + cardW / 2}" y="${signNameY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${FG}">${esc(signName)}</text>
  <text x="${cardX + cardW / 2}" y="${signCharY}" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">${esc(signChar)}</text>

  <rect x="${cardX + 48}" y="${readingStartY - 22}" width="4" height="${readingLines.length * readingLineH + 6}" fill="${ACCENT}"/>
  ${readingSvg}

  <line x1="${cardX + 48}" y1="${omenLabelY - 20}" x2="${cardX + cardW - 48}" y2="${omenLabelY - 20}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${cardX + 48}" y="${omenLabelY}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${ACCENT2}">TODAY'S OMEN</text>
  ${omenSvg}
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

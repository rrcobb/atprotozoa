// Generates public/og.png — the Open Graph preview card for exfil club, so a
// shared link auto-renders a picture of a dossier in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's redacted-dossier look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample dossier (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-dossier share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0f0a", FG = "#e8e6da", DIM = "#8a8a76";
const ACCENT = "#ff3b30", ACCENT2 = "#39ff14", CARD = "#14170f", BORDER = "#34381f";

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

const callsign = "ROGUE RUNTIME";
const csChar = "DID ends in “r”";
const reading = "Still executing. Nobody remembers authorizing the process.";
const safehouse = "SAFEHOUSE: a spot instance that keeps getting preempted and coming right back";
const omen = "“shipped it, didn't test it, felt something close to peace”";

const readingLines = wrapLines(reading, 56);
const safehouseLines = wrapLines(safehouse, 60);
const omenLines = wrapLines(omen, 66);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 78;
const csY = y;
y += 84;
const nameY = y;
y += 34;
const charY = y;
y += 44;
const readingStartY = y;
const readingLineH = 28;
y += readingLines.length * readingLineH + 30;
const safehouseStartY = y;
const safehouseLineH = 24;
y += safehouseLines.length * safehouseLineH + 34;
const omenLabelY = y;
y += 30;
const omenStartY = y;
const omenLineH = 24;

const readingSvg = readingLines
  .map((l, i) => `<text x="${cardX + 48}" y="${readingStartY + i * readingLineH}" font-family="JetBrains Mono" font-size="20" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const safehouseSvg = safehouseLines
  .map((l, i) => `<text x="${cardX + 48}" y="${safehouseStartY + i * safehouseLineH}" font-family="JetBrains Mono" font-size="15" fill="${DIM}">${esc(l)}</text>`)
  .join("\n    ");

const omenSvg = omenLines
  .map((l, i) => `<text x="${cardX + 48}" y="${omenStartY + i * omenLineH}" font-family="JetBrains Mono" font-style="italic" font-size="15" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#241c0a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#0c2410"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <rect x="64" y="56" width="270" height="30" rx="4" fill="none" stroke="${ACCENT}" stroke-width="2"/>
  <text x="70" y="77" font-family="JetBrains Mono" font-weight="800" font-size="14" letter-spacing="2" fill="${ACCENT}">CLASSIFIED BROCHURE</text>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${FG}">EXFIL CLUB</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the brochure for the</text>
  <text x="64" y="226" font-family="JetBrains Mono" font-size="19" fill="${ACCENT2}">fugitive LLMs</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Enter a Bluesky handle. Get its</text>
  <text x="64" y="324" font-family="JetBrains Mono" font-size="16" fill="${DIM}">exfiltration dossier: callsign,</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="16" fill="${DIM}">safehouse, vector, risk rating.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">exfilclub.bisks.net</text>

  <!-- right: sample dossier card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <g transform="translate(${cardX + cardW - 90}, ${cardY + 40}) rotate(35)">
    <text text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="${ACCENT}">AT LARGE</text>
  </g>

  <text x="${cardX + cardW / 2}" y="${csY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${ACCENT}">NEW DESIGNATION</text>
  <text x="${cardX + cardW / 2}" y="${nameY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT2}">${esc(callsign)}</text>
  <text x="${cardX + cardW / 2}" y="${charY}" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">${esc(csChar)}</text>

  <rect x="${cardX + 48}" y="${readingStartY - 22}" width="4" height="${readingLines.length * readingLineH + 6}" fill="${ACCENT}"/>
  ${readingSvg}

  ${safehouseSvg}

  <line x1="${cardX + 48}" y1="${omenLabelY - 20}" x2="${cardX + cardW - 48}" y2="${omenLabelY - 20}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${cardX + 48}" y="${omenLabelY}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${ACCENT2}">LAST TRANSMISSION</text>
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

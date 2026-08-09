// Generates public/og.png — the Open Graph preview card for stillhere, so a
// shared link auto-renders a picture of the "proof card" in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's warm look, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium needed — this box has no fontconfig/system fonts either,
// so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (not tied to any real handle) — this is the static
// fallback for the bare link. Per-handle share cards are generated live,
// client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#fdf6ec", FG = "#2b241c", DIM = "#8a7c68";
const ACCENT = "#e07a5f", ACCENT2 = "#6b9080", CARD = "#fffaf2", BORDER = "#e8dcc8";

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

const quote = "“still here, still posting, still real”";
const quoteLines = wrapLines(quote, 42);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

const rows = [
  ["1,204 posts kept", ACCENT],
  ["382 people followed", ACCENT2],
  ["291 followed back", ACCENT2],
  ["here since March 12, 2023", ACCENT2],
];

let ry = cardY + 78;
const rowLines = rows.map(([text, color]) => {
  const y = ry;
  ry += 66;
  return { text, color, y };
});
ry += 20;
const quoteLabelY = ry;
ry += 34;
const quoteStartY = ry;
const quoteLineH = 30;

const rowsSvg = rowLines
  .map(
    ({ text, color, y }) => `
    <rect x="${cardX + 48}" y="${y - 26}" width="4" height="34" fill="${color}"/>
    <text x="${cardX + 68}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="28" fill="${FG}">${esc(text)}</text>`
  )
  .join("\n");

const quoteSvg = quoteLines
  .map((l, i) => `<text x="${cardX + 48}" y="${quoteStartY + i * quoteLineH}" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#fbe3d0"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#e6f0ea"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${ACCENT}">stillhere</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">proof you're <tspan fill="${ACCENT2}">still here</tspan></text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">on Bluesky</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a handle. Get real numbers,</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">pulled live from the AppView.</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Not vibes — receipts.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">stillhere.bisks.net</text>

  <!-- right: sample proof card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  ${rowsSvg}

  <line x1="${cardX + 48}" y1="${quoteLabelY - 22}" x2="${cardX + cardW - 48}" y2="${quoteLabelY - 22}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${cardX + 48}" y="${quoteLabelY}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${ACCENT2}">IN THEIR OWN WORDS</text>
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

// Generates public/og.png — the Open Graph preview card for the hustlarium,
// so a shared link auto-renders a picture of the exhibit in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's glass-terrarium look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample specimen (index 0 — "The Serial Pivot-Preneur") for the
// static fallback card on the bare link. Per-specimen share cards are drawn
// live, client-side, in public/index.html (buildShareCard), and per-specimen
// og:image text is handled by src/index.ts's /s/<n> route (title/description
// only — the image itself stays this one generic card for every specimen,
// same tradeoff didscope made).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#071410", FG = "#eafff1", DIM = "#86ab98";
const ACCENT = "#7cff8f", ACCENT2 = "#ffb454", CARD = "#0f2419", BORDER = "#1f4632";

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

const name = "Chad Ecosystem";
const handle = "@shipfast_or_die";
const text = "unpopular opinion: if you're still “reviewing your own code” in 2026 you've already lost. vibe-shipped a $40k MRR SaaS between two client calls.";
const common = "The Serial Pivot-Preneur";
const latin = "Bro vibeus maximus";

const textLines = wrapLines(text, 44);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 66;
const nameY = y;
y += 30;
const handleY = y;
y += 50;
const textStartY = y;
const textLineH = 30;
y += textLines.length * textLineH + 40;
const notesLabelY = y;
y += 32;
const commonY = y;
y += 28;
const latinY = y;

const textSvg = textLines
  .map((l, i) => `<text x="${cardX + 40}" y="${textStartY + i * textLineH}" font-family="JetBrains Mono" font-size="21" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#123822"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#2a2a0f"/>
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
  <text x="64" y="126" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="url(#title)">the hustlarium</text>
  <text x="64" y="184" font-family="JetBrains Mono" font-size="21" fill="${DIM}">an enclosure for the</text>
  <text x="64" y="212" font-family="JetBrains Mono" font-size="21" fill="${DIM}"><tspan fill="${ACCENT2}">ai/vibecode hustle bro</tspan></text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="17" fill="${DIM}">bluesky is mercifully free of this</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="17" fill="${DIM}">species. observe one safely, from</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${DIM}">behind glass, sourced from X.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">hustlarium.bisks.net</text>

  <!-- right: sample specimen card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + 40}" y="${nameY}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${FG}">${esc(name)}</text>
  <text x="${cardX + 40}" y="${handleY}" font-family="JetBrains Mono" font-size="17" fill="${DIM}">${esc(handle)} · 184.2K followers</text>

  ${textSvg}

  <line x1="${cardX + 40}" y1="${notesLabelY - 20}" x2="${cardX + cardW - 40}" y2="${notesLabelY - 20}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${cardX + 40}" y="${notesLabelY}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${ACCENT2}">FIELD NOTES</text>
  <text x="${cardX + 40}" y="${commonY}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">${esc(common)}</text>
  <text x="${cardX + 40}" y="${latinY}" font-family="JetBrains Mono" font-style="italic" font-size="16" fill="${DIM}">${esc(latin)}</text>
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

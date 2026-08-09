// Generates public/og.png — the Open Graph preview card for hairloom, so a
// shared link auto-renders a picture of a cure in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, matching the live page's
// apothecary-label look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample cure (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-person share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Copied from sites/didscope/og-gen.mjs and retinted.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#14100a", FG = "#f4e9d4", DIM = "#b8a582";
const ACCENT = "#d99a3d", ACCENT2 = "#7fa66b", CARD = "#241b10", BORDER = "#4a3a22";

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

const glyph = "M";
const curename = "The Minoxidil Micro-Dose";
const curechar = "DID ends in “m”";
const blurb = "The one that's actually real, taken at a homeopathic quarter-dose so it doesn't have to work.";
const potency = "62% potency (surprisingly persuasive)";

const blurbLines = wrapLines(blurb, 58);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 78;
const glyphY = y;
y += 92;
const curenameY = y;
y += 34;
const curecharY = y;
y += 34;
const potencyY = y;
y += 50;
const blurbStartY = y;
const blurbLineH = 30;

const blurbSvg = blurbLines
  .map((l, i) => `<text x="${cardX + 48}" y="${blurbStartY + i * blurbLineH}" font-family="JetBrains Mono" font-size="21" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a2810"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#1f3a24"/>
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
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">hairloom</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">the cure for baldness,</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">passed down through your <tspan fill="${ACCENT2}">did:plc</tspan></text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get a real</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">cure, a ritual, a side effect, and a</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">patient testimonial off your own feed.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">hairloom.bisks.net</text>

  <!-- right: sample cure card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${glyphY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="72" fill="${ACCENT2}">${glyph}</text>
  <text x="${cardX + cardW / 2}" y="${curenameY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${FG}">${esc(curename)}</text>
  <text x="${cardX + cardW / 2}" y="${curecharY}" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">${esc(curechar)}</text>
  <text x="${cardX + cardW / 2}" y="${potencyY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}">${esc(potency)}</text>

  <rect x="${cardX + 48}" y="${blurbStartY - 22}" width="4" height="${blurbLines.length * blurbLineH + 6}" fill="${ACCENT}"/>
  ${blurbSvg}
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

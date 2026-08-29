// Generates public/og.png — the Open Graph preview card for quantizeme, so a
// shared link auto-renders a picture of the verdict card in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's verdict-card look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample verdict (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-account share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0d12", FG = "#eef2f6", DIM = "#8a94a3";
const ACCENT = "#8f7bff", ACCENT2 = "#ff6bd6", CARD = "#12161d", BORDER = "#232b36";

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

const gb = "~19 GB";
const spec = "34B params, Q4_K_M quant";
const topFailure = "top failure mode: Reversal";
const blurb = "confident, wrong, and confident about being wrong. scaling up didn't fix it, it just got louder.";

const cardX = 470, cardY = 90, cardW = 668, cardH = 450;
const blurbLines = wrapLines(blurb, 40);

const blurbSvg = blurbLines
  .map((l, i) => `<text x="${cardX + 68}" y="${cardY + 258 + i * 27}" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#241a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="50%">
      <stop offset="0" stop-color="#3a1430"/>
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
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">quantizeme</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">what size of <tspan fill="${ACCENT}">LLM</tspan></text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">thinks like you?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a handle. It downloads their</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">whole post history and greps for</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">failure modes language models have.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">quantizeme.bisks.net</text>

  <!-- right: sample verdict card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 46}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${DIM}">ESTIMATED MODEL SIZE</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 130}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${ACCENT2}">${gb}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 162}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}">${spec}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 192}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${DIM}">${topFailure}</text>

  <rect x="${cardX + 48}" y="${cardY + 216}" width="4" height="60" fill="${ACCENT2}"/>
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

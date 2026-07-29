// Generates public/og.png — the Open Graph preview card for epistemics, so a
// shared link auto-renders a picture of the docket in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's courtroom-mirror look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample reading (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-reading share cards are generated
// live, client-side, in public/index.html (buildShareCard); per-handle share
// links get their own personalized og:title/og:description via src/index.ts.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0d12", FG = "#eef2f6", DIM = "#8a94a3";
const ACCENT = "#e8b64c", ACCENT2 = "#ff6b6b", CARD = "#12161d", BORDER = "#232b36";

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

const score = "7";
const verdict = "a pattern is emerging, your honor.";
const topic = "re: “that one framework”";

const verdictLines = wrapLines(verdict, 34);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

const verdictStartY = cardY + 300;
const verdictLineH = 30;

const verdictSvg = verdictLines
  .map((l, i) => `<text x="${cardX + 48}" y="${verdictStartY + i * verdictLineH}" font-family="JetBrains Mono" font-style="italic" font-size="22" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a2210"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#2a1414"/>
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
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">epistemics</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">hold a mirror up to</text>
  <text x="64" y="214" font-family="JetBrains Mono" font-size="20" fill="${DIM}">your words</text>

  <text x="64" y="286" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get every</text>
  <text x="64" y="312" font-family="JetBrains Mono" font-size="17" fill="${DIM}">reversal, hedge, and unearned</text>
  <text x="64" y="338" font-family="JetBrains Mono" font-size="17" fill="${DIM}">"obviously" read back to you.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">bisks.net/epistemics</text>

  <!-- right: sample docket card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 56}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${DIM}">EPISTEMIC SINS ON FILE</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 170}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="110" fill="${ACCENT2}">${score}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 212}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${ACCENT}">${esc(topic)}</text>

  <rect x="${cardX + 48}" y="${verdictStartY - 22}" width="4" height="${verdictLines.length * verdictLineH + 6}" fill="${ACCENT}"/>
  ${verdictSvg}
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

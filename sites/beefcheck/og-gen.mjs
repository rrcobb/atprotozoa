// Generates public/og.png — the Open Graph preview card for beefcheck, so a
// shared link auto-renders a picture of the scoreboard in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample scoreboard (not tied to any real handles) — this is the
// static fallback card for the bare link. Per-pair share cards are generated
// live, client-side, in public/index.html (buildShareCard); per-pair share
// links get their own personalized og:title/og:description via src/index.ts.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0908", FG = "#f5efe9", DIM = "#a5938a";
const ACCENT = "#ff6b3d", ACCENT2 = "#ffb84c", BAD = "#ff5c5c", CARD = "#17110f", BORDER = "#2c2019";

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

const score = "68";
const verdict = "there's a pattern here that doesn't read as nothing.";

const verdictLines = wrapLines(verdict, 30);

const cardX = 470, cardY = 40, cardW = 668, cardH = 550;
const verdictStartY = cardY + 336;
const verdictLineH = 28;

const verdictSvg = verdictLines
  .map((l, i) => `<text x="${cardX + cardW / 2}" y="${verdictStartY + i * verdictLineH}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const avR = 44, avY = cardY + 90, avLX = cardX + 130, avRX = cardX + cardW - 130;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1608"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#2a0f0f"/>
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
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">beefcheck</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">are they beefing?</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Two Bluesky handles in. Reply</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${DIM}">and like exchange, follow status,</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${DIM}">reply tone, and engagement that</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="17" fill="${DIM}">suddenly stopped, read back out.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${BAD}">beefcheck.bisks.net</text>

  <!-- right: sample scoreboard card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <circle cx="${avLX}" cy="${avY}" r="${avR}" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
  <circle cx="${avRX}" cy="${avY}" r="${avR}" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${avLX}" y="${avY + 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="34" fill="${DIM}">?</text>
  <text x="${avRX}" y="${avY + 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="34" fill="${DIM}">?</text>
  <text x="${cardX + cardW / 2}" y="${avY + 10}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">vs</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 210}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${DIM}">BEEF SCORE</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 310}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="96" fill="${BAD}">${score}</text>

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

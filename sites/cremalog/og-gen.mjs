// Generates public/og.png — the Open Graph preview card for cremalog, so a
// shared link auto-renders a card in Bluesky / other unfurlers. Hand-drawn
// SVG at the canonical OG size, matching the live page's cream-and-gold
// cafe-menu look, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium needed — this box has no fontconfig/system fonts either,
// so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const PAPER = "#f7efe1", PAPER_DARK = "#efe2c8", CARD = "#fffaf0";
const INK = "#2c1c12", DIM = "#6b5643", GOLD = "#a8672a", GOLD_DARK = "#7c4a1c", BORDER = "#e3d2b5";

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

const pitchLines = wrapLines("Rate every latte out of 10, leave a note, and watch a taste chart build over time.", 34);

// A small sample review card, right side.
const cardX = 700, cardY = 90, cardW = 430, cardH = 420;

// A tiny hand-placed "chart" squiggle for the sample card — six points, not
// computed from real data (this is decorative sample art, not a live render).
const sparkPts = [
  [cardX + 40, cardY + 300],
  [cardX + 105, cardY + 270],
  [cardX + 170, cardY + 320],
  [cardX + 235, cardY + 240],
  [cardX + 300, cardY + 260],
  [cardX + 365, cardY + 200],
];
const sparkPath = sparkPts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="8%" r="55%">
      <stop offset="0" stop-color="${PAPER_DARK}"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="DejaVu Serif" font-weight="700" font-size="76" fill="${GOLD_DARK}">cremalog</text>
  <rect x="66" y="172" width="220" height="4" fill="${GOLD}"/>

  ${pitchLines
    .map((l, i) => `<text x="64" y="${240 + i * 34}" font-family="DejaVu Serif" font-size="24" fill="${DIM}">${esc(l)}</text>`)
    .join("\n  ")}

  <text x="64" y="400" font-family="DejaVu Serif" font-size="19" fill="${DIM}">Every review is a real atproto record</text>
  <text x="64" y="428" font-family="DejaVu Serif" font-size="19" fill="${DIM}">in your own PDS.</text>

  <text x="64" y="560" font-family="DejaVu Serif" font-weight="700" font-size="22" fill="${GOLD_DARK}">cremalog.bisks.net</text>

  <!-- right: sample review card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="8" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <rect x="${cardX}" y="${cardY}" width="6" height="${cardH}" fill="${GOLD}"/>

  <text x="${cardX + 42}" y="${cardY + 66}" font-family="DejaVu Serif" font-size="28" fill="${INK}">banana bread</text>
  <text x="${cardX + 42}" y="${cardY + 100}" font-family="DejaVu Serif" font-size="28" fill="${INK}">matcha latte</text>
  <text x="${cardX + 42}" y="${cardY + 140}" font-family="DejaVu Serif" font-size="18" fill="${DIM}">the corner place</text>

  <text x="${cardX + cardW - 42}" y="${cardY + 100}" text-anchor="end" font-family="DejaVu Serif" font-weight="700" font-size="46" fill="${GOLD_DARK}">7.5</text>
  <text x="${cardX + cardW - 42}" y="${cardY + 128}" text-anchor="end" font-family="DejaVu Serif" font-size="17" fill="${DIM}">/ 10</text>

  <line x1="${cardX + 42}" y1="${cardY + 166}" x2="${cardX + cardW - 42}" y2="${cardY + 166}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>

  <text x="${cardX + 42}" y="${cardY + 200}" font-family="DejaVu Serif" font-size="18" fill="${INK}">"it was okay"</text>

  <text x="${cardX + 42}" y="${cardY + 250}" font-family="DejaVu Serif" font-weight="700" font-size="13" letter-spacing="1.5" fill="${GOLD_DARK}">TASTE OVER TIME</text>
  <line x1="${cardX + 40}" y1="${cardY + 330}" x2="${cardX + 390}" y2="${cardY + 330}" stroke="${BORDER}" stroke-width="1"/>
  <path d="${sparkPath}" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  ${sparkPts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${GOLD}" stroke="${CARD}" stroke-width="2"/>`).join("\n  ")}
</svg>`;

const regularPath = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const boldPath = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [regularPath, boldPath], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

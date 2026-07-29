// Generates public/og.png — the Open Graph preview card for copypastalibs,
// so a shared bare link (no /p/<handle>/... permalink) still renders a
// picture in Bluesky / other unfurlers. Hand-drawn SVG at the canonical OG
// size, matching the live page's black-on-white mono/blue-accent look,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium —
// this box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample (not tied to any real handle) — the static fallback
// card for the bare link. Per-card share images are generated live,
// client-side, in public/index.html (drawShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Copied from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", FAINTBG = "#f6f6f6", ACCENT = "#1a5fd0";

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

const sampleTitle = "the navy seal";
const sampleHandle = "@cee.wtf";
const sampleText =
  "What the WAFFLE did you just say about me, you cursed goblin? I'll have you know I graduated top of my class in the modem warfare, and I've been involved in numerous secret raids on printers…";

const sampleLines = wrapLines(sampleText, 46);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 70;
const cardHeadY = y;
y += 30;
const cardSubY = y;
y += 46;
const titleY = y;
y += 44;
const textStartY = y;
const textLineH = 30;

const textSvg = sampleLines
  .map(
    (l, i) =>
      `<text x="${cardX + 44}" y="${textStartY + i * textLineH}" font-family="JetBrains Mono" font-size="20" fill="${INK}">${esc(l)}</text>`,
  )
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${INK}" stroke-width="3"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${ACCENT}">copypastalibs</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">mad-libs from someone's</text>
  <text x="64" y="198" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">own words</text>

  <text x="64" y="280" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Enter a Bluesky handle. It learns the</text>
  <text x="64" y="306" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">words they actually use, and mad-libs</text>
  <text x="64" y="332" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">them into classic copypastas.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/copypastalibs</text>

  <!-- right: sample card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="${FAINTBG}" stroke="${FAINT}" stroke-width="1.5"/>

  <text x="${cardX + 44}" y="${cardHeadY}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">${esc(sampleTitle)}</text>
  <text x="${cardX + cardW - 44}" y="${cardHeadY}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">${esc(sampleHandle)}</text>
  <line x1="${cardX + 44}" y1="${cardSubY}" x2="${cardX + cardW - 44}" y2="${cardSubY}" stroke="${FAINT}" stroke-width="1"/>

  <rect x="${cardX + 24}" y="${titleY - 24}" width="${cardW - 48}" height="${textStartY - titleY + sampleLines.length * textLineH + 14}" fill="${BG}" stroke="${INK}" stroke-width="1.5"/>
  ${textSvg}
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

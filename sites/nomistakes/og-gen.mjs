// Generates public/og.png — the Open Graph preview card for nomistakes, so a
// shared bare link auto-renders a picture of the bit in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's terminal look, rasterised with @resvg/resvg-js (pure native module,
// no system Chromium needed — this box has no fontconfig/system fonts
// either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A fixed sample demand (not tied to any real seed) — this is the static
// fallback card for the bare link. Per-demand share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#050a06", GLOW = "#0e2a14", FG = "#c8ffd4", DIM = "#5f8f6f";
const ACCENT = "#34ff7a", AMBER = "#ffb000", CARD = "#0b160c", BORDER = "#1f3a24";

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

const demand = "Fable, one-shot rewrite GitHub in Rust. Make no mistakes. Do a breakthrough. Ship it before lunch.";
const verdict = "it compiled. it is also down.";

const demandLines = wrapLines(demand, 34);
const verdictLines = wrapLines("STATUS: " + verdict, 34);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 70;
const promptY = y;
y += 42;
const demandStartY = y;
const demandLineH = 34;
y += demandLines.length * demandLineH + 30;
const verdictStartY = y;
const verdictLineH = 28;

const demandSvg = demandLines
  .map((l, i) => `<text x="${cardX + 64}" y="${demandStartY + i * demandLineH}" font-family="JetBrains Mono" font-size="23" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const verdictSvg = verdictLines
  .map((l, i) => `<text x="${cardX + 44}" y="${verdictStartY + i * verdictLineH}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${AMBER}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="${GLOW}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${ACCENT}">nomistakes</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">a generator for the "one-shot</text>
  <text x="64" y="214" font-family="JetBrains Mono" font-size="20" fill="${DIM}">rewrite X in Y, make no mistakes,</text>
  <text x="64" y="240" font-family="JetBrains Mono" font-size="20" fill="${DIM}">do a breakthrough" genre of demand.</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Press the button. Get a fresh</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="17" fill="${DIM}">impossible mandate. Find out how</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="17" fill="${DIM}">it went.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">nomistakes.bisks.net</text>

  <!-- right: sample demand card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + 44}" y="${promptY}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">$ nomistakes --generate</text>

  <rect x="${cardX + 44}" y="${demandStartY - 26}" width="4" height="${demandLines.length * demandLineH + 6}" fill="${ACCENT}"/>
  ${demandSvg}

  <line x1="${cardX + 44}" y1="${verdictStartY - 22}" x2="${cardX + cardW - 44}" y2="${verdictStartY - 22}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
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

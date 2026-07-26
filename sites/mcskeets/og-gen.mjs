// Generates public/og.png — the Open Graph preview card for mcskeets, so a
// shared link auto-renders a picture of a receipt in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's drive-thru-receipt look, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample order (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-order share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#fdf6e3", FG = "#241000", DIM = "#7a5a3a";
const RED = "#da291c", CARD = "#fffdf7", BORDER = "#241000";

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

const storeNo = "K7Q2";
const orderNo = "417";
const sandwich = "The Vibe-Coded McWrap";
const side = "Fries, Extra Large, No Reason";
const drink = "Vanilla Coke, Underrated, Correctly";
const dessertLine = "SOFT-SERVE MACHINE: DOWN";
const dessertSub = "it's always down. this is not a bug, it's tradition.";
const total = "$9.47";
const note = "“shipped it, didn’t test it, felt something close to peace”";

const noteLines = wrapLines(note, 46);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 46;
const storeLineY = y;
y += 60;
const sandwichY = y;
y += 40;
const sideY = y;
y += 32;
const drinkY = y;
y += 32;
const dessertY = y;
y += 26;
const dessertSubY = y;
y += 46;
const totalY = y;
y += 44;
const noteLabelY = y;
y += 30;
const noteStartY = y;
const noteLineH = 24;

const noteSvg = noteLines
  .map((l, i) => `<text x="${cardX + 40}" y="${noteStartY + i * noteLineH}" font-family="JetBrains Mono" font-style="italic" font-size="17" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#ffd3cc"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${RED}">mcskeets</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">your <tspan fill="${RED}">did:plc</tspan> is your</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">value meal</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get a real</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">sandwich, side, drink, and a live</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">check on the soft-serve machine.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${RED}">mcskeets.bisks.net</text>

  <!-- right: sample receipt card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="${CARD}" stroke="${BORDER}" stroke-width="2" stroke-dasharray="6,5"/>

  <text x="${cardX + cardW / 2}" y="${storeLineY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${DIM}">MCSKEETS #${storeNo} &#183; ORDER ${orderNo}</text>

  <text x="${cardX + cardW / 2}" y="${sandwichY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${RED}">${esc(sandwich)}</text>

  <text x="${cardX + 40}" y="${sideY}" font-family="JetBrains Mono" font-size="19" fill="${FG}">${esc(side)}</text>
  <text x="${cardX + 40}" y="${drinkY}" font-family="JetBrains Mono" font-size="19" fill="${FG}">${esc(drink)}</text>
  <text x="${cardX + 40}" y="${dessertY}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${RED}">${esc(dessertLine)}</text>
  <text x="${cardX + 40}" y="${dessertSubY}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">${esc(dessertSub)}</text>

  <text x="${cardX + 40}" y="${totalY}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${DIM}">TOTAL ${total}</text>

  <line x1="${cardX + 40}" y1="${noteLabelY - 22}" x2="${cardX + cardW - 40}" y2="${noteLabelY - 22}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${cardX + 40}" y="${noteLabelY}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${RED}">SPECIAL INSTRUCTIONS</text>
  ${noteSvg}
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
